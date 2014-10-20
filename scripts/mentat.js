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

importScripts('../assets/moment/moment-with-locales.js');
var window = { moment: moment };
importScripts('../assets/moment/moment-timezone-with-data-2010-2020.js');
importScripts('../assets/underscore/underscore.js');

importScripts('calculations.js');
importScripts('intervals.js');
importScripts('dispatch.js');

var open = _.partial(openSymbolDatabase, indexedDB, _.map(intervals, 'storeName'));
dispatch({
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
            event.data.expressions.forEach(function(expression){
                var calc = getCalculation(calculations, [expression])[0];
                var msg = calc.getErrorMessage();
                if (msg)
                    throw new Error(msg + ' in ' + expression);
            });
        }
    },
    validate: function(event) {
        return validateExpressions(calculations, intervals, event.data);
    },
    increment: function(event) {
        var data = event.data;
        var interval = intervals[data.interval];
        if (!interval) throw Error("Unknown interval: " + data.interval);
        return data.exchanges.reduce(function(memo, exchange){
            var next = interval.inc(exchange, data.asof, data.increment || 1);
            if (memo && memo.valueOf() < next.valueOf()) return memo;
            return next.toDate();
        }, null);
    },

    'import': function(event) {
        var interval = intervals[event.data.period];
        if (!interval) throw Error("Unknown interval: " + data.interval);
        return importData(open, interval, event.data);
    },
    reset: function(event) {
        return Promise.all(intervals.map(function(interval){
            return open(event.data.security, interval, "readwrite", function(store, resolve, reject) {
                return resolve(store.clear());
            });
        })).then(function(){
            return {
                status: 'success'
            };
        });
    },
    load: function(event) {
        var data = event.data;
        var interval = intervals[data.interval];
        if (!interval) throw Error("Unknown interval: " + data.interval);
        return loadData(calculations, open, data.failfast, data.security, data.exchange,
            data.length, data.lower, data.upper, interval, data.expressions
        );
    },
    screen: function(event){
        var data = event.data;
        var load = pointLoad(calculations, open, data.failfast, data.security, data.exchange, data.screens, data.asof, data.asof);
        return filterSecurity(intervals, load, data.security, data.screens, data.asof);
    },
    signal: function(event){
        var data = event.data;
        var interval = [].concat(data.entry, data.exit).reduce(function(smallest, screen){
            return screen.filters.reduce(function(smallest, filter){
                var int = intervals[filter.indicator.interval];
                if (int.millis < smallest.millis) return int;
                else return smallest;
            }, smallest);
        }, intervals.d5);
        var inc = function(date){
            return interval.inc(data.exchange, date, 1).toDate();
        };
        var load = pointLoad(calculations, open, data.failfast, data.security, data.exchange, [].concat(data.entry, data.exit), data.begin, data.end);
        var screenSecurity = filterSecurity.bind(this, intervals, load, data.security);
        return findSignals(screenSecurity, data.entry, data.exit, inc, data.begin, data.end).then(function(results){
            var statuses = _.uniq(results.map(_.property('status')));
            var message = _.uniq(_.compact(results.map(_.property('message'))).sort(), true).join('\n');
            return {
                status: statuses.length == 1 ? statuses[0] : 'warning',
                message: message,
                begin: data.begin,
                end: data.end,
                falifast: data.failfast,
                result: results.map(_.property('result')),
                quote: _.flatten(results.map(_.property('quote')))
            };
        });
    }
});

function pointLoad(calculations, open, failfast, security, exchange, screens, lower, upper) {
    var datasets = {};
    var exprs = screens.reduce(function(exprs, screen){
        return screen.filters.reduce(function(exprs, filter){
            var expr = filter.indicator.expression;
            var interval = filter.indicator.interval;
            if (!exprs[interval]) exprs[interval] = [];
            if (exprs[interval].indexOf(expr) < 0) exprs[interval].push(expr);
            return exprs;
        }, exprs);
    }, {});
    return function(asof, interval) {
        if (!datasets[interval.storeName]) {
            datasets[interval.storeName] = loadData(calculations, open, failfast, security, exchange,
                1, lower, upper, interval, exprs[interval.storeName]);
        }
        return datasets[interval.storeName].then(function(data){
            var idx = _.sortedIndex(data.result, {
                asof: asof
            }, 'asof');
            var i = data.result[idx] && data.result[idx].asof.valueOf() <= asof.valueOf() ? idx : idx - 1;
            return _.extend({}, data, {
                result: data.result[i]
            });
        });
    };
}

function findSignals(screenSecurity, entry, exit, inc, begin, end) {
    return findNextSignal(screenSecurity, entry, inc, inc(begin), end).then(function(first){
        if (!first) return null;
        return findSignals(screenSecurity, exit, entry, inc, first.result.asof, end).then(function(rest){
            if (!rest) return [first];
            rest.unshift(first);
            return rest;
        });
    });
}

function findNextSignal(screenSecurity, screens, inc, asof, until) {
    if (asof.valueOf() > until.valueOf()) return Promise.resolve(null);
    return screenSecurity(screens, asof).then(function(data){
        if (data.result) return data;
        return findNextSignal(screenSecurity, screens, inc, inc(asof), until);
    });
}

function validateExpressions(calculations, intervals, data) {
    var calcs = asCalculation(calculations, [data.expression]);
    var errorMessage = _.first(_.compact(_.invoke(calcs, 'getErrorMessage')));
    if (errorMessage) {
        throw new Error(errorMessage);
    } else if (!data.interval || intervals[data.interval]) {
        return {
            status: 'success'
        };
    } else {
        throw new Error("Invalid interval: " + data.interval);
    }
}

function importData(open, interval, data) {
    var now = Date.now();
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
    return storeData(open, data.security, interval, points).then(function(){
        return {
            status: 'success'
        };
    });
}

function filterSecurity(intervals, load, security, screens, asof){
    return Promise.all(screens.map(function(screen) {
        return reduceFilters(intervals, screen.filters, function(promise, filters, interval){
            return promise.then(function(memo){
                if (!memo) return memo;
                return loadFilteredPoint(load, asof, interval, filters).then(function(point){
                    if (!point) return point;
                    return {
                        status: !memo.status || memo.status == point.status ? point.status : 'warning',
                        quote: _.compact(_.flatten([memo.quote, point.quote])),
                        result: _.extend(memo.result || {
                            security: security,
                            signal: screen.signal
                        }, point.result)
                    };
                });
            });
        }, Promise.resolve({
            status: 'success',
            result: {
                security: security,
                signal: screen.signal
            }
        }));
    })).then(function(orResults) {
        return orResults.reduce(function(memo, point) {
            return memo || point;
        }, null);
    }).then(function(point){
        // if no screens are provide, just return the security
        return point && point.status && point || screens.length === 0 && {
            status: 'success',
            result: {security: security}
        } || {status: 'success'};
    });
}

function reduceFilters(intervals, filters, iterator, memo){
    var getInterval = _.compose(_.property('interval'), _.property('indicator'));
    var byInterval = _.groupBy(filters, getInterval);
    var sorted = _.sortBy(_.keys(byInterval), function(interval) {
        if (!intervals[interval]) throw Error("Unknown interval: " + interval);
        return intervals[interval].millis;
    }).reverse();
    return _.reduce(sorted, function(memo, interval){
        return iterator(memo, byInterval[interval], intervals[interval]);
    }, memo);
}

function loadFilteredPoint(load, asof, interval, filters) {
    var expressions = _.map(filters,  _.compose(_.property('expression'), _.property('indicator')));
    return load(asof, interval, expressions).then(function(data){
        if (!data.result) return Promise.reject(_.extend(data, {
            status: 'error',
            message: "No results for interval: " + interval.storeName,
            interval: interval.storeName
        }));
        return data;
    }).then(function(data){
        var pass =_.reduce(filters, function(pass, filter) {
            if (!pass) return false;
            var value = data.result[filter.indicator.expression];
            if (filter.min || filter.min === 0) {
                if (isNaN(value) || value < +filter.min)
                    return false;
            }
            if (filter.max || filter.max === 0) {
                if (isNaN(value) || +filter.max < value)
                    return false;
            }
            return pass;
        }, true);
        if (pass) {
            return data;
        } else {
            return null;
        }
    });
}

function loadData(calculations, open, failfast, security, exchange, length, lower, upper, interval, expressions) {
    var calcs = asCalculation(calculations, expressions);
    var n = _.max(_.invoke(calcs, 'getDataLength'));
    var errorMessage = _.first(_.compact(_.invoke(calcs, 'getErrorMessage')));
    if (errorMessage) throw Error(errorMessage);
    return collectIntervalRange(open, failfast, security, exchange, interval, length + n - 1, lower, upper).then(function(data) {
        var updates = [];
        var startIndex = Math.max(lengthBelow(data.result, lower) - length, 0);
        var result = _.map(startIndex ? data.result.slice(startIndex) : data.result, function(result, i) {
            var updated = false;
            var point = _.reduce(calcs, function(point, calc, c){
                if (_.isUndefined(point[expressions[c]])) {
                    var points = preceding(data.result, calc.getDataLength(), startIndex + i);
                    point[expressions[c]] = calc.getValue(points);
                    updated = true;
                }
                return point;
            }, result);
            if (updated) {
                updates.push(point);
            }
            return point;
        });
        if (updates.length) {
            return storeData(open, security, interval, updates).then(_.constant(_.extend(data, {
                result: result
            })));
        }
        return _.extend(data, {
            result: result
        });
    });
}

function collectIntervalRange(open, failfast, security, exchange, interval, length, lower, upper) {
    if (!interval.derivedFrom)
        return collectRawRange(open, failfast, security, exchange, interval, length, lower, upper);
    return open(security, interval, 'readonly', collect.bind(this, length, lower, upper)).then(function(result){
        var next = result.length ? interval.inc(exchange, result[result.length - 1].asof, 1) : null;
        var ticker = decodeURI(security.substring(exchange.iri.length + 1));
        var below = lengthBelow(result, lower);
        if (below >= length && next && (next.valueOf() > upper.valueOf() || next.valueOf() > Date.now())) {
            // result complete
            return {
                status: 'success',
                result: result
            };
        } else if (result.length && below >= length) {
            // need to update with newer data
            var last = result[result.length - 1];
            return collectAggregateRange(open, failfast, security, exchange, interval, 0, last.asof, upper).then(function(aggregated){
                return storeData(open, security, interval, aggregated.result).then(_.constant(aggregated));
            }).then(function(aggregated){
                return _.extend(aggregated, {
                    result: result.concat(aggregated.result)
                });
            });
        } else {
            // no data available
            var floored = interval.floor(exchange, lower).toDate();
            return collectAggregateRange(open, failfast, security, exchange, interval, length, floored, upper).then(function(aggregated){
                return storeData(open, security, interval, aggregated.result).then(_.constant(aggregated));
            });
        }
    });
}

function collectAggregateRange(open, failfast, security, exchange, interval, length, lower, upper) {
    var ceil = interval.ceil.bind(interval, exchange);
    var end = ceil(upper).valueOf() == upper.valueOf() ? upper : interval.floor(exchange, upper).toDate();
    var size = interval.aggregate * length + 1;
    return collectRawRange(open, failfast, security, exchange, interval.derivedFrom, size, lower, end).then(function(data){
        if (!data.result.length) return data;
        var upper, count, discard = ceil(data.result[0].asof).valueOf();
        var result = data.result.reduce(function(result, point){
            if (point.asof.valueOf() <= discard) return result;
            var preceding = result[result.length-1];
            if (!preceding || point.asof.valueOf() > upper.valueOf()) {
                result.push(point);
                upper = ceil(point.asof);
                count = 0;
            } else {
                result[result.length-1] = {
                    asof: point.asof,
                    open: preceding.open,
                    close: point.close,
                    adj_close: point.adj_close,
                    total_volume: point.total_volume,
                    high: Math.max(preceding.high, point.high),
                    low: Math.min(preceding.low, point.low),
                    volume: interval.storeName.charAt(0) == 'd' ?
                        Math.round((preceding.volume * count + point.volume) / (++count)) :
                        (preceding.volume + point.volume)
                };
            }
            return result;
        }, []);
        return _.extend(data, {
            result: result
        });
    });
}

function collectRawRange(open, failfast, security, exchange, period, length, lower, upper) {
    return open(security, period, 'readonly', collect.bind(this, length, lower, upper)).then(function(result){
        var conclude = failfast ? Promise.reject.bind(Promise) : Promise.resolve.bind(Promise);
        var next = result.length ? period.inc(exchange, result[result.length - 1].asof, 1) : null;
        var ticker = decodeURI(security.substring(exchange.iri.length + 1));
        var below = lengthBelow(result, lower);
        if (below >= length && next && (next.valueOf() > upper.valueOf() || next.valueOf() > Date.now())) {
            // result complete
            return {
                status: 'success',
                result: result
            };
        } else if (result.length && below >= length) {
            return open(security, period, 'readonly', nextItem.bind(this, upper)).then(function(newer){
                if (newer) return { // result complete
                    status: 'success',
                    result: result
                };
                // need to update with newer data
                return conclude({
                    status: failfast ? 'error' : 'warning',
                    message: 'Need newer data points',
                    result: result,
                    quote: [{
                        security: security,
                        exchange: exchange,
                        ticker: ticker,
                        period: period.storeName,
                        result: result,
                        start: moment(result[result.length - 1].asof).format()
                    }]
                });
            });
        } else if (result.length && below < length) {
            var earliest = lower.valueOf() < result[0].asof.valueOf() ? lower : result[0].asof;
            // need more historic data
            var quote = [{
                security: security,
                exchange: exchange,
                ticker: ticker,
                period: period.storeName,
                result: result,
                start: period.dec(exchange, earliest, 2 * (length - below)).format(),
                end: moment(result[0].asof).format()
            }];
            if (next.valueOf() < upper.valueOf()) {
                quote.push({
                    security: security,
                    exchange: exchange,
                    ticker: ticker,
                    period: period.storeName,
                    start: moment(result[result.length - 1].asof).format()
                });
            }
            return conclude({
                status: failfast ? 'error' : 'warning',
                message: 'Need more data points',
                result: result,
                quote: quote
            });
        } else {
            // no data available
            return open(security, period, 'readonly', nextItem.bind(this, null)).then(function(earliest){
                var d1 = period.dec(exchange, lower, length);
                var d2 = earliest ? moment(earliest.asof) : d1;
                var start = d1.valueOf() < d2.valueOf() ? d1 : d2;
                return Promise.reject({
                    status: 'error',
                    message: 'No data points available',
                    quote: [{
                        security: security,
                        exchange: exchange,
                        ticker: ticker,
                        period: period.storeName,
                        start: start.format()
                    }]
                });
            });
        }
    });
}

function storeData(open, security, interval, data) {
    if (!data.length) return Promise.resolve(data);
    console.log("Storing", data.length, interval.storeName, security, data[data.length-1]);
    return open(security, interval, "readwrite", function(store, resolve, reject){
        var counter = 0;
        var onsuccess = function(){
            if (++counter >= data.length) {
                resolve(data);
            }
        };
        data.forEach(function(datum,i){
            var op = store.put(datum);
            op.onerror = reject;
            op.onsuccess = onsuccess;
        });
    });
}

function openSymbolDatabase(indexedDB, storeNames, security, interval, mode, callback) {
    return new Promise(function(resolve, reject) {
        var request = indexedDB.open(security, 5);
        request.onerror = reject;
        request.onupgradeneeded = function(event) {
            try {
                var db = event.target.result;
                // Create an objectStore for this database
                storeNames.forEach(function(name){
                    if (!db.objectStoreNames.contains(name)) {
                        db.createObjectStore(name, { keyPath: "asof" });
                    }
                });
            } catch(e) {
                reject(e);
            }
        };
        request.onsuccess = function(event) {
            try {
                var db = event.target.result;
                var trans = db.transaction(interval.storeName, mode);
                return callback(trans.objectStore(interval.storeName), resolve, reject);
            } catch(e) {
                reject(e);
            }
        };
    });
}

function collect(below, lower, upper, store, resolve, reject) {
    var results = [];
    var between = 0;
    var cursor = store.openCursor(IDBKeyRange.upperBound(upper), "prev");
    cursor.onerror = reject;
    cursor.onsuccess = function(event) {
        try {
            var cursor = event.target.result;
            if (cursor) {
                if (cursor.value.asof.valueOf() > lower.valueOf()) {
                    between = results.length + 1;
                }
                if (results.length < below + between) {
                    results.push(cursor.value);
                    cursor.continue();
                    return;
                }
            }
            resolve(results.reverse());
        } catch (e) {
            reject(e);
        }
    };
}

function lengthBelow(result, lower) {
    var below = _.sortedIndex(result, {
        asof: lower
    }, 'asof');
    return below < result.length && result[below].asof.valueOf() <= lower.valueOf() ? below +1 : below;
}

function nextItem(lower, store, resolve, reject) {
    var cursor = lower ? store.openCursor(IDBKeyRange.lowerBound(lower), "next") : store.openCursor();
    cursor.onerror = reject;
    cursor.onsuccess = function(event) {
        try {
            var cursor = event.target.result;
            if (cursor) {
                resolve(cursor.value);
            } else {
                resolve(null);
            }
        } catch (e) {
            reject(e);
        }
    };
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
    var startIndex = Math.max(0, endIndex - len + 1);
    for (var i=startIndex; i < array.length && i <= endIndex; i++) {
        list.push(array[i]);
    }
    return list;
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
