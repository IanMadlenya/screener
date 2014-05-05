// conductor.js
/* 
 *  Copyright (c) 2014 James Leigh, Some Rights Reserved
 * 
 *  Redistribution and use in source and binary forms, with or without
 *  modification, are permitted provided that the following conditions are met:
 * 
 *  1. Redistributions of source code must retain the above copyright notice,
 *  this list of conditions and the following disclaimer.
 * 
 *  2. Redistributions in binary form must reproduce the above copyright
 *  notice, this list of conditions and the following disclaimer in the
 *  documentation and/or other materials provided with the distribution.
 * 
 *  3. Neither the name of the copyright holder nor the names of its
 *  contributors may be used to endorse or promote products derived from this
 *  software without specific prior written permission.
 * 
 *  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 *  AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 *  IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 *  ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
 *  LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 *  CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 *  SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 *  INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 *  CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 *  ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 *  POSSIBILITY OF SUCH DAMAGE.
 */
/*
 * Does not access IndexedDB directly, but handles data assembly/screening and
 * builds requested dataset based on sub messages sent to other workers
 */

importScripts('../assets/underscore/underscore.js');
importScripts('../assets/moment/moment-with-langs.js');
var window = { moment: moment };
importScripts('../assets/moment/moment-timezone.js');
importScripts('../assets/moment/moment-timezone-data.js');

self.addEventListener("connect", _.partial(function(services, event) {
    event.ports[0].onmessage = _.partial(dispatch, {

        close: function(event) {
            self.close();
        },

        ping: function() {
            return 'pong';
        },

        register: (function(services, event) {
            console.log("Registering service", event.data.name);
            if (!services[event.data.service]) {
                services[event.data.service] = {};
            }
            services[event.data.service][event.data.name] = event.ports[0];
        }).bind(this, services),

        validate: (function(services, event){
            var worker = getWorkerPort(services.mentat, event.data.expression);
            return promiseMessage({
                cmd: 'fields',
                expressions: [event.data.expression]
            }, worker).then(_.property('result')).then(function(fields){
                return Promise.all(_.map(services.quote, function(quote){
                    return promiseMessage({
                        cmd: 'validate',
                        interval: event.data.interval,
                        fields: _.without(fields, 'asof')
                    }, quote).catch(Promise.resolve);
                }));
            }).then(function(results){
                return results.filter(function(result){
                    return result.status == 'success' || result.message;
                });
            }).then(function(results){
                if (!results.length) throw new Error("Unknown interval: " + event.data.interval);
                return results;
            }).then(function(results){
                if (_.every(results, function(result){
                    return result.status != 'success';
                })) return results[0];
                return results.filter(function(result){
                    return result.status == 'success';
                })[0];
            });
        }).bind(this, services),

        'exchange-list': _.memoize(function(event) {
            return promiseJSON('../queries/exchange-list.rq?tqx=out:table')
                .then(tableToObjectArray)
                .then(function(result){
                    return result;
                });
        }),

        'sector-list': serviceMessage.bind(this, services, 'list'),

        'security-list': serviceMessage.bind(this, services, 'list'),

        'indicator-list': _.memoize(function(event) {
            return promiseJSON('../queries/indicator-list.rq?tqx=out:table')
                .then(tableToObjectArray)
                .then(function(result){
                    return result;
            });
        }),

        load: (function(services, event) {
            var data = event.data;
            var worker = getWorkerPort(services.mentat, data.security);
            return retryAfterImport(services, promiseMessage.bind(this, data), worker).then(function(data){
                return data.result;
            });
        }).bind(this, services),

        'watch-list': function(params) {
            var url = '../queries/watch-list.rq?tqx=out:table';
            return promiseJSON(params ? (url + '&' + params) : url)
                .then(tableToObjectArray)
                .then(function(result){
                    return result;
                });
        },

        'screen-list': function(params) {
            var url = '../queries/screen-list.rq?tqx=out:table';
            return promiseJSON(params ? (url + '&' + params) : url)
                .then(tableToObjectArray)
                .then(function(result){
                    return result;
                });
        },

        screen: screenSecurities.bind(this, services)
    });
}, {list: {}, quote: {}, mentat: {}}), false);

function screenSecurities(services, event) {
    var data = event.data;
    var byExchange = _.groupBy(data.watchLists, _.compose(_.property('iri'), _.property('exchange')));
    return Promise.all(_.map(byExchange, function(watchLists) {
        var exchange = watchLists[0].exchange;
        var filter = filterSecurity.bind(this, services, data.screens, data.asof, exchange);
        return listSecurities(services, watchLists).then(function(securities) {
            return Promise.all(securities.map(filter));
        }).then(_.compact);
    })).then(_.flatten).then(function(result) {
        return result;
    });
}

function listSecurities(services, watchLists) {
    return Promise.all(watchLists.map(function(watchList){
        return Promise.resolve(watchList).then(function(watchList){
            if (!watchList.includeSectors)
                return [];
            return Promise.all(watchList.includeSectors.map(function(sector){
                return serviceMessage(services, 'list', {
                    data: {
                        cmd: 'security-list',
                        exchange: watchList.exchange,
                        sector: sector,
                        mincap: watchList.mincap,
                        maxcap: watchList.maxcap
                    }
                }).then(_.property('result'));
            }));
        }).then(_.flatten).then(function(result){
            var includes = watchList.includes || [];
            var excludes = watchList.excludes || [];
            return includes.concat(_.difference(result, excludes));
        });
    })).then(_.flatten).then(_.uniq);
}

function filterSecurity(services, screens, asof, exchange, security){
    var worker = getWorkerPort(services.mentat, security);
    return Promise.all(screens.map(function(screen) {
        var getInterval = _.compose(_.property('interval'), _.property('indicator'));
        return Promise.resolve(_.groupBy(screen.filters, getInterval)).then(function(byInterval){
            return Promise.all(_.map(byInterval,
                loadFilteredPoint.bind(this, services, asof, exchange, security, worker)
            )).then(_.compact).then(function(intervalPoints) {
                var pass = intervalPoints.length == _.size(byInterval);
                if (pass) {
                    return _.reduce(intervalPoints, function(memo, value){
                        return _.extend(memo, value);
                    }, {security: security});
                } else {
                    return null;
                }
            });
        });
    })).then(function(orResults) {
        return orResults.reduce(function(memo, point) {
            return memo || point;
        }, null);
    }).then(function(point){
        // if no screens are provide, just return the security
        return point || screens.length === 0 && {security: security};
    })
}

function loadFilteredPoint(services, asof, exchange, security, worker, filters, interval) {
    var expressions = _.map(filters,  _.compose(_.property('expression'), _.property('indicator')));
    return loadRange(services, asof, exchange, security, expressions, 1, interval, worker).then(function(result){
        if (result.length < 1) return Promise.reject({
            status: 'error',
            message: "No results for interval: " + interval
        });
        return _.object(expressions, result[result.length - 1]);
    }).then(function(point){
        var pass = _.reduce(filters, function(pass, filter) {
            if (!pass)
                return false;
            var value = point[filter.indicator.expression];
            if (filter.min && value < filter.min)
                return false;
            if (filter.max && filter.max < value)
                return false;
            return pass;
        }, true);
        if (pass) {
            return point;
        } else {
            return null;
        }
    }).catch(function(error){
        console.log('Could not load ' + security, error);
    });
}

function loadRange(services, asof, exchange, security, expressions, length, interval, worker) {
    return retryAfterImport(services, promiseMessage.bind(this, {
        cmd: 'load',
        security: security,
        exchange: exchange,
        interval: interval,
        expressions: expressions,
        length: length,
        asof: asof
    }), worker).then(function(data){
        return data.result;
    });
}

function retryAfterImport(services, func, worker) {
    return func(worker).catch(function(error){
        var now = Date.now();
        var inc = addInterval.bind(this, error.exchange.tz, error.interval);
        if (error.status == 'warning' && error.from && now < inc(error.from, 1).valueOf()) {
            // nothing is expected yet, use what we have
            return Promise.resolve(error);
        } else if (error.from && error.to) {
            // try to load more
            var floor = startOfInterval.bind(this, error.exchange.tz, error.interval);
            var end = error.latest && now < inc(error.latest, 1).valueOf() ? moment(error.earliest) : inc(error.to, 100);
            var ticker = decodeURI(error.security.substring(error.exchange.iri.length + 1));
            return Promise.all(_.map(services.quote, function(quote){
                return promiseMessage({
                    cmd: 'quote',
                    exchange: error.exchange,
                    ticker: ticker,
                    interval: error.interval,
                    start: floor(error.from).format(),
                    end: end.format()
                }, quote).then(function(data){
                    return data.result.map(function(point){
                        var obj = {};
                        var tz = point.tz || error.exchange.tz;
                        if (point.dateTime) {
                            obj.asof = moment.tz(point.dateTime, tz).toDate();
                        } else if (point.date) {
                            var time = point.date + ' ' + error.exchange.marketClosesAt;
                            obj.asof = moment.tz(time, tz).toDate();
                        }
                        for (var prop in point) {
                            if (_.isNumber(point[prop]))
                                obj[prop] = point[prop];
                        }
                        return obj;
                    }).filter(function(point){
                        // Yahoo provides weekly/month-to-date data
                        return point.asof.valueOf() <= now;
                    });
                }).then(function(points){
                    return promiseMessage({
                        cmd: 'import',
                        security: error.security,
                        interval: error.interval,
                        points: points
                    }, worker);
                });
            })).then(func.bind(this, worker)).catch(function(error){
                if (error.status == 'warning') {
                    // just use what we have
                    return Promise.resolve(error);
                } else {
                    return Promise.reject(error);
                }
            });
        } else {
            return Promise.reject(error);
        }
    });
}

function addInterval(tz, interval, latest, amount) {
    var offset = parseInt(interval.substring(1), 10);
    var local = moment(latest).tz(tz);
    var unit;
    if (interval.indexOf('d') === 0) {
        var units = offset * (amount || 1);
        var w = Math.floor(units / 5);
        var d = units - w * 5;
        var day = local.add('weeks', w);
        if (day.isoWeekday() + d < 6) {
            return day.add('days', d);
        } else {
            // skip over weekend
            return day.add('days', d + 2);
        }
    } else if (interval.indexOf('w') === 0) {
        unit = 'weeks';
    } else if (interval.indexOf('m') === 0) {
        unit = 'months';
    } else if (interval.indexOf('s') === 0) {
        unit = 'seconds';
    } else if (interval.indexOf('t') === 0) {
        return latest;
    }
    return local.add(unit, offset * (amount || 1));
}

function startOfInterval(tz, interval, asof) {
    var mod = parseInt(interval.substring(1), 10);
    var local = moment(asof).tz(tz);
    var base, unit;
    if (interval.indexOf('d') === 0) {
        base = moment(local).startOf('isoWeek').isoWeek(1);
        unit = 'days';
    } else if (interval.indexOf('w') === 0) {
        base = moment(local).startOf('isoWeek').isoWeek(1);
        unit = 'weeks';
    } else if (interval.indexOf('m') === 0) {
        base = moment(local).startOf('year');
        unit = 'months';
    } else if (interval.indexOf('s') === 0) {
        base = moment(local).startOf('day');
        unit = 'seconds';
    } else if (interval.indexOf('t') === 0) {
        return local.format();
    }
    var offset = Math.floor(local.diff(base, unit) / mod) * mod;
    return base.add(unit, offset);
}

function tableToObjectArray(table){
    return table.rows.map(function(row){
        return _.object(table.columns, row);
    });
}

function promiseMessage(data, port) {
    return new Promise(function(resolve, reject){
        var channel = new MessageChannel();
        var timeout = setTimeout(function(){
            console.log("Still waiting for a response for", data);
            timeout = setTimeout(function(){
                console.log("Aborting", data);
                reject(_.extend({}, data, {status: 'error', message: "Service took too long to respond"}));
            }, 30000);
        }, 30000);
        channel.port2.onmessage = function(event) {
            clearTimeout(timeout);
            if (event.data.status === undefined || event.data.status == 'success') {
                resolve(event.data);
            } else {
                reject(event.data);
            }
        };
        port.postMessage(data, [channel.port1]);
    });
}

function serviceMessage(services, name, event) {
    if (!services[name] || !_.keys(services[name]).length)
        throw new Error('No ' + name + ' service registered');
    return Promise.all(_.map(services[name], function(service) {
        return promiseMessage(event.data, service);
    })).then(combineResult);
}

function combineResult(results){
    return _.reduce(results, function(memo, msg) {
        var result = msg.result.concat(memo.result);
        return _.extend(memo, msg, {result: result});
    }, {result: []});
}

var throttledLog = _.throttle(console.log.bind(console), 1000);
function getWorkerPort(workers, string) {
    var keys = _.keys(workers);
    var mod = keys.length;
    var w = (hashCode(string) % mod + mod) % mod;
    var key = keys[w];
    throttledLog("Called worker ", key);
    return workers[key];
}

function hashCode(str){
    var hash = 0, i, char;
    if (str.length === 0) return hash;
    for (i = 0, l = str.length; i < l; i++) {
        char  = str.charCodeAt(i);
        hash  = ((hash<<5)-hash)+char;
        hash |= 0; // Convert to 32bit integer
    }
    return hash;
}

function promiseJSON(url) {
    return new Promise(function(resolve, reject) {
        var xhr = new XMLHttpRequest();
        xhr.onreadystatechange = function(){
            if (xhr.readyState == 4 && (xhr.status == 200 || xhr.status == 203)) {
                resolve(JSON.parse(xhr.responseText));
            } else if (xhr.readyState == 4) {
                reject({status: xhr.statusText, statusCode: xhr.status, message: xhr.responseText});
            }
        };
        xhr.open("GET", url, true);
        xhr.send();
    });
}

function dispatch(handler, event){
    var cmd = event.data.cmd || event.data;
    if (typeof cmd == 'string' && typeof handler[cmd] == 'function') {
        Promise.resolve(event).then(handler[cmd]).then(function(result){
            if (_.isObject(result) && result.status && _.isObject(event.data)) {
                event.ports[0].postMessage(_.extend(_.omit(event.data, 'points', 'result'), result));
            } else if (result !== undefined) {
                event.ports[0].postMessage(result);
            }
        }).catch(rejectNormalizedError).catch(function(error){
            var clone = _.isString(event.data) ? {cmd: event.data} : _.omit(event.data, 'points', 'result');
            event.ports[0].postMessage(_.extend(clone, error));
        });
    } else if (event.ports && event.ports.length) {
        console.log('Unknown command ' + cmd);
        event.ports[0].postMessage({
            status: 'error',
            message: 'Unknown command ' + cmd
        });
    } else {
        console.log(event.data);
    }
}

function rejectNormalizedError(error) {
    if (error.status != 'error' || error.message) {
        console.log(error);
    }
    if (error && error.status == 'error') {
        return Promise.reject(error);
    } else if (error.target && error.target.errorCode){
        return Promise.reject({
            status: 'error',
            errorCode: error.target.errorCode
        });
    } else if (error.message && error.stack) {
        return Promise.reject({
            status: 'error',
            message: error.message,
            stack: error.stack
        });
    } else if (error.message) {
        return Promise.reject({
            status: 'error',
            message: error.message
        });
    } else {
        return Promise.reject({
            status: 'error',
            message: error
        });
    }
}
