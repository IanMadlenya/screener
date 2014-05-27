// mentat.js
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

importScripts('../assets/underscore/underscore.js');
importScripts('../assets/moment/moment-with-langs.js');
var window = { moment: moment };
importScripts('../assets/moment/moment-timezone.js');
importScripts('../assets/moment/moment-timezone-data.js');

importScripts('calculations.js'); // getCalculations

self.addEventListener("connect", _.partial(function(calculations, open, event) {
    var intervals = ['t144', 't233', 't610', 's120', 's300', 's600', 's1800', 's3600', 's14400', 'd1', 'w1', 'm1', 'm3', 'm12'];
    event.ports[0].onmessage = _.partial(dispatch, {

        close: function(event) {
            self.close();
        },

        ping: function() {
            return 'pong';
        },

        fields: function(event) {
            var calcs = asCalculation(calculations, event.data.expressions);
            var errorMessage = _.first(_.compact(_.invoke(calcs, 'getErrorMessage')));
            if (!errorMessage) {
                return _.uniq(_.flatten(_.invoke(calcs, 'getFields')));
            } else {
                throw new Error(errorMessage);
            }
        },

        validate: function(event) {
            return validateExpressions(calculations, intervals, event.data);
        },
        'import': function(event) {
            return importData(open.bind(this, intervals), Date.now(), event.data);
        },
        load: function(event) {
            var data = event.data;
            var now = Date.now();
            return loadData(calculations, open.bind(this, intervals), now,
                data.asof, data.exchange, data.security, data.failfast,
                data.expressions, data.length, data.interval
            );
        },
        screen: function(event){
            var data = event.data;
            var now = Date.now();
            return filterSecurity(calculations, open.bind(this, intervals), now,
                data.screens, data.asof, data.exchange, data.security, data.failfast
            );
        }
    });
}, getCalculations(), _.partial(openSymbolDatabase, indexedDB)), false);

function validateExpressions(calculations, intervals, data) {
    var calcs = asCalculation(calculations, [data.expression]);
    var errorMessage = _.first(_.compact(_.invoke(calcs, 'getErrorMessage')));
    if (errorMessage) {
        throw new Error(errorMessage);
    } else if (!data.interval || intervals.indexOf(data.interval) >= 0) {
        return {
            status: 'success'
        };
    } else {
        throw new Error("Invalid interval: " + data.interval);
    }
}

function importData(open, now, data) {
    var points = data.points.map(function(point){
        var obj = {};
        var tz = point.tz || data.exchange.tz;
        if (point.dateTime) {
            obj.asof = moment.tz(point.dateTime, tz).toDate();
        } else if (point.date) {
            var time = point.date + ' ' + data.exchange.marketClosesAt;
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
    return open(data.security).then(function(db) {
        var store = db.transaction([data.interval], "readwrite").objectStore(data.interval);
        return Promise.all(points.map(function(point){
            return new Promise(function(resolve, reject){
                var op = store.put(point);
                op.onerror = reject;
                op.onsuccess = resolve;
            });
        }));
    }).then(function(){
        return {
            status: 'success'
        };
    });
}

function loadData(calculations, open, now, asof, exchange, security, failfast, expressions, length, interval) {
    return evaluateExpressions(calculations, open, failfast,
        security, exchange, interval, length, asof, now, expressions
    ).then(function(data){
        if (data.result.length > length) {
            return _.extend(data, {
                result: data.result.slice(data.result.length - length, data.result.length)
            });
        } else {
            return data;
        }
    });
}

function filterSecurity(calculations, open, now, screens, asof, exchange, security, failfast){
    return Promise.all(screens.map(function(screen) {
        var getInterval = _.compose(_.property('interval'), _.property('indicator'));
        return Promise.resolve(_.groupBy(screen.filters, getInterval)).then(function(byInterval){
            return Promise.all(_.map(byInterval,
                loadFilteredPoint.bind(this, calculations, open, now, asof, exchange, security, failfast)
            )).then(_.compact).then(function(intervalPoints) {
                var pass = intervalPoints.length == _.size(byInterval);
                if (pass) {
                    var status = _.uniq(_.pluck(intervalPoints, 'status'));
                    return {
                        status: status.length == 1 ? status[0] : 'warning',
                        quote: _.compact(_.pluck(intervalPoints, "quote")),
                        result: _.reduce(_.pluck(intervalPoints, "result"), function(memo, value){
                            return _.extend(memo, value);
                        }, {
                            security: security
                        })
                    };
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
        return point || screens.length === 0 && {
            status: 'success',
            result: {security: security}
        } || {status: 'success'};
    });
}

function loadFilteredPoint(calculations, open, now, asof, exchange, security, failfast, filters, interval) {
    var expressions = _.map(filters,  _.compose(_.property('expression'), _.property('indicator')));
    return loadData(calculations, open, now, asof, exchange, security, failfast, expressions, 1, interval).then(function(data){
        if (data.result.length < 1) return Promise.reject(_.extend(data, {
            status: 'error',
            message: "No results for interval: " + interval,
            interval: interval
        }));
        return _.extend(data, {
            result: _.object(expressions, data.result[data.result.length - 1])
        });
    }).then(function(data){
        var pass = _.reduce(filters, function(pass, filter) {
            if (!pass)
                return false;
            var value = data.result[filter.indicator.expression];
            if (filter.min && value < filter.min)
                return false;
            if (filter.max && filter.max < value)
                return false;
            return pass;
        }, true);
        if (pass) {
            return data;
        } else {
            return null;
        }
    });
}

function evaluateExpressions(calculations, open, failfast, security, exchange, interval, length, asof, now, expressions) {
    var calcs = asCalculation(calculations, expressions);
    var n = _.max(_.invoke(calcs, 'getDataLength'));
    return new Promise(function(resolve, reject){
        var errorMessage = _.first(_.compact(_.invoke(calcs, 'getErrorMessage')));
        if (!errorMessage) {
            resolve(security);
        } else {
            throw new Error(errorMessage);
        }
    }).then(open).then(function(db){
        var store = db.transaction([interval]).objectStore(interval);
        return collectRange(failfast, security, exchange, interval, length + n - 1, asof, now, store);
    }).then(function(data) {
        var startIndex = Math.max(data.result.length - length, 0);
        return _.extend(data, {
            result: _.map(_.range(startIndex, data.result.length), function(i) {
                return _.map(calcs, function(calc){
                    var points = preceding(data.result, calc.getDataLength(), i);
                    return calc.getValue(points);
                });
            })
        });
    });
}

function openSymbolDatabase(indexedDB, intervals, security) {
    return new Promise(function(resolve, reject) {
        var request = indexedDB.open(security);
        request.onsuccess = resolve;
        request.onerror = reject;
        request.onupgradeneeded = function(event) {
            var db = event.target.result;
            // Create an objectStore for this database
            intervals.forEach(function(interval){
                db.createObjectStore(interval, { keyPath: "asof" });
            });
        };
    }).then(function(event){
        return event.target.result;
    });
}

function collectRange(failfast, security, exchange, interval, length, asof, now, store) {
    return new Promise(function(resolve, reject){
        var conclude = failfast ? reject : resolve;
        var cursor = store.openCursor(IDBKeyRange.upperBound(asof), "prev");
        cursor.onerror = reject;
        cursor.onsuccess = collect(length, function(result){
            result = result.reverse();
            var inc = addInterval.bind(this, exchange.tz, interval);
            var next = result.length ? inc(result[result.length - 1].asof, 1) : null;
            var ticker = decodeURI(security.substring(exchange.iri.length + 1));
            if (result.length >= length && (next.valueOf() > asof.valueOf() || next.valueOf() > now)) {
                // result complete
                return resolve({
                    status: 'success',
                    result: result
                });
            } else if (result.length >= length) {
                // need to update with newer data
                return conclude({
                    status: failfast ? 'error' : 'warning',
                    message: 'Need more data points',
                    result: result,
                    quote: [{
                        security: security,
                        exchange: exchange,
                        ticker: ticker,
                        interval: interval,
                        result: result,
                        start: next.format(),
                        end: moment(now).tz(exchange.tz).format()
                    }]
                });
            } else if (result.length && result.length < length) {
                // need more historic data
                return conclude({
                    status: failfast ? 'error' : 'warning',
                    message: 'Need more data points',
                    result: result,
                    quote: [{
                        security: security,
                        exchange: exchange,
                        ticker: ticker,
                        interval: interval,
                        result: result,
                        start: inc(result[0].asof, -2 * (length - result.length)).format(),
                        end: inc(result[0].asof, -1).format()
                    }]
                });
            } else {
                // no data available
                var cursor = store.openCursor();
                cursor.onerror = reject;
                cursor.onsuccess = collect(1, function(arrayOfOne){
                    var earliest = arrayOfOne.length ? arrayOfOne[0] : null;
                    var thismoment = moment(now).tz(exchange.tz);
                    var end = earliest ? inc(earliest.asof, -1) : thismoment;
                    return reject({
                        status: 'error',
                        message: 'No data points available',
                        quote: [{
                            security: security,
                            exchange: exchange,
                            ticker: ticker,
                            interval: interval,
                            start: inc(asof, -2 * length).format(),
                            end: end.format()
                        }]
                    });
                }, reject);
            }
        }, reject);
    });
}

function collect(n, callback, catcher) {
    return _.partial(function(results, event) {
        var cursor = event.target.result;
        if (cursor) {
            results.push(cursor.value);
            if (!_.isNumber(n) || results.length < n) {
                cursor.continue();
                return;
            }
        }
        try {
            callback(results);
        } catch (e) {
            catcher(e);
        }
    }, []);
}

function findIndex(array, predicate) {
    for (var i=0; i < array.length; i++) {
        if (predicate(array[i])) {
            return i;
        }
    }
    return undefined;
}

function preceding(array, len, endIndex) {
    var list = [];
    var startIndex = _.max([0, endIndex - len + 1]);
    for (var i=startIndex; i < array.length && i <= endIndex; i++) {
        list.push(array[i]);
    }
    return list;
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
        if (d < 1 || day.isoWeekday() + d < 6) {
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

function asCalculation(calculations, expressions) {
    return _.map(expressions, function(expr){
        if (!expr.match(/^[A-Za-z\-_]+\([0-9A-Za-z\.\-_, ]*\)$/)) {
            if (expr.indexOf('(') > 0)
                return calculations.unknown(expr); // incomplete function
            return calculations.identity(expr); // field
        }
        var idx = expr.indexOf('(');
        var func = expr.substring(0, idx);
        if (!calculations[func])
            return calculations.unknown(expr); // unknown function
        var params = expr.substring(idx + 1, expr.length - 1);
        var args = _.reduceRight(_.map(params.split(/\s*,\s*/), function(value){
            if (value.match(/^\d+$/))
                return parseInt(value, 10);
            if (value.match(/^[0-9\.]+$/))
                return parseFloat(value);
            return value;
        }), function(memo, value){
            if (memo.length || value !== '')
                memo.unshift(value);
            return memo;
        }, []);
        return calculations[func].apply(calculations[func], args);
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
    return Promise.reject(normalizedError(error));
}

function normalizedError(error) {
    if (error && error.status && error.status != 'success') {
        return error;
    } else if (error.target && error.target.errorCode){
        return {
            status: 'error',
            errorCode: error.target.errorCode
        };
    } else if (error.message && error.stack) {
        return _.extend({
            status: 'error',
            message: error.message,
            stack: error.stack
        }, _.omit(error, 'prototype', _.functions(error)));
    } else if (error.message) {
        return _.extend({
            status: 'error'
        }, _.omit(error, 'prototype', _.functions(error)));
    } else {
        return {
            status: 'error',
            message: error
        };
    }
}
