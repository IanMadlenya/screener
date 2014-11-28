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

importScripts('calculations.js'); // parseCalculation
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
        var calcs = asCalculation(parseCalculation, event.data.expressions);
        var errorMessage = _.first(_.compact(_.invoke(calcs, 'getErrorMessage')));
        if (!errorMessage) {
            return _.uniq(_.flatten(_.invoke(calcs, 'getFields')));
        } else {
            event.data.expressions.forEach(function(expression){
                var calc = parseCalculation(expression);
                var msg = calc.getErrorMessage();
                if (msg)
                    throw new Error(msg + ' in ' + expression);
            });
        }
    },
    validate: function(event) {
        return validateExpressions(parseCalculation, intervals, event.data);
    },
    increment: function(event) {
        var data = event.data;
        if (!intervals[interval]) throw Error("Unknown interval: " + data.interval);
        return data.exchanges.reduce(function(memo, exchange){
            var period = createPeriod(intervals, data.interval, exchange);
            var next = period.inc(data.asof, data.increment || 1);
            if (memo && memo.valueOf() < next.valueOf()) return memo;
            return next.toDate();
        }, null);
    },

    'import': function(event) {
        var period = createPeriod(intervals, event.data.interval, event.data.exchange);
        if (!period) throw Error("Unknown interval: " + data.interval);
        return importData(open, period, event.data.security, event.data.points);
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
        var period = createPeriod(intervals, data.interval, data.exchange);
        if (!period) throw Error("Unknown interval: " + data.interval);
        return loadData(parseCalculation, open, data.failfast, data.security,
            data.length, data.lower, data.upper, period, data.expressions
        );
    },
    screen: function(event){
        var data = event.data;
        var load = pointLoad(parseCalculation, open, data.failfast, data.security, data.screens, data.begin, data.end);
        var periods = screenPeriods(intervals, data.exchange, data.screens);
        return screenSecurity(periods, load, data.security, data.screens, data.begin, data.end);
    },
    signal: function(event){
        var data = event.data;
        var screens = [].concat(data.entry, data.exit);
        var load = pointLoad(parseCalculation, open, data.failfast, data.security, screens, data.begin, data.end);
        var periods = screenPeriods(intervals, data.exchange, screens);
        return findSignals(periods, load, data.security, data.entry, data.exit, data.begin, data.end);
    }
});

function pointLoad(parseCalculation, open, failfast, security, screens, lower, upper) {
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
    return function(asof, period) {
        if (!datasets[period.interval]) {
            datasets[period.interval] = loadData(parseCalculation, open, failfast, security,
                1, lower, upper, period, exprs[period.interval]);
        }
        return datasets[period.interval].then(function(data){
            var idx = _.sortedIndex(data.result, {
                asof: asof
            }, 'asof');
            var i = !idx || data.result[idx] && data.result[idx].asof.valueOf() <= asof.valueOf() ? idx : idx - 1;
            return _.extend({}, data, {
                result: _.clone(data.result[i])
            });
        });
    };
}

function screenPeriods(intervals, exchange, screens) {
    var used = _.sortBy(_.uniq(_.flatten(screens.map(function(screen) {
        return _.uniq(screen.filters.map(function(filter){
            return filter.indicator.interval;
        }));
    }))), function(interval) {
        if (!intervals[interval]) throw Error("Unknown interval: " + interval);
        return intervals[interval].millis * -1;
    });
    return used.reduce(function(periods, interval){
        periods[interval] = createPeriod(intervals, interval, exchange);
        return periods;
    }, {});
}

function findSignals(periods, load, security, entry, exit, begin, end) {
    return screenSecurity(periods, load, security, entry, begin, end).then(function(first){
        if (!first.result) return _.extend(first, {
            result: []
        });
        return findSignals(periods, load, security, exit, entry, first.until, end).then(function(rest){
            rest.result.unshift(first.result);
            return _.extend(rest, {
                status: first.status == rest.status ? first.status : 'warning',
                message: first.message || rest.message,
                quote: first.quote && rest.quote ? first.quote.concat(rest.quote) : first.quote || rest.quote,
                begin: begin,
                end: end
            });
        });
    });
}

function screenSecurity(periods, load, security, screens, begin, end){
    return screens.reduce(function(promise, screen){
        return promise.then(function(data){
            if (data) return data;
            if (!screen.filters.length) return {
                status: 'success',
                result: {
                    security: security,
                    signal: screen.signal
                }
            };
            var getInterval = _.compose(_.property('interval'), _.property('indicator'));
            var byInterval = _.groupBy(screen.filters, getInterval);
            var sorted = _.sortBy(_.keys(byInterval), function(interval) {
                if (!periods[interval]) throw Error("Unknown interval: " + interval);
                return periods[interval].millis * -1;
            });
            return filterSecurityByPeriods(load, sorted.map(function(interval) {
                return {
                    period: periods[interval],
                    filters: byInterval[interval]
                };
            }), begin, begin, end).then(function(data){
                if (!data) return data;
                else return _.extend(data, {
                    result: _.extend(data.result, {
                        security: security,
                        signal: screen.signal
                    })
                });
            });
        });
    }, Promise.resolve()).then(function(data){
        return data || {status: 'success'};
    });
}

function filterSecurityByPeriods(load, periodsAndFilters, lower, begin, upper) {
    var first = _.first(periodsAndFilters);
    var rest = _.rest(periodsAndFilters);
    if (first.period.ceil(upper).valueOf() < first.period.floor(begin).valueOf())
        return Promise.resolve(null);
    return findNextActiveFilter(load, first.period, first.filters, begin, upper).then(function(data){
        if (!data || data.result.asof.valueOf() > upper.valueOf()) return null;
        else if (!rest.length) return data;
        var start = maxDate(lower, data.result.asof);
        return filterSecurityByPeriods(load, rest, start, start, minDate(upper, data.until)).then(function(child){
            if (child) return {
                status: !data.status || data.status == child.status ? child.status : 'warning',
                quote: _.compact(_.flatten([data.quote, child.quote])),
                result: _.extend(data.result, child.result),
                until:  child.until
            };
            var inc = first.period.inc(maxDate(begin, data.result.asof), 1);
            return filterSecurityByPeriods(load, periodsAndFilters, lower, inc, upper);
        });
    });
}

function findNextActiveFilter(load, period, filters, begin, until) {
    if (period.ceil(until).valueOf() < period.floor(begin).valueOf())
        return Promise.resolve(null);
    return loadFilteredPoint(load, period, filters, minDate(begin,until)).then(function(data){
        var inc = period.inc(begin, 1);
        if (data.status == 'failure')
            return findNextActiveFilter(load, period, filters, inc, until);
        else return loadFilteredPoint(load, period, filters, inc).then(function(data){
            return data.result.asof;
        }).then(function(next){
            return _.extend(data, {
                until: next.valueOf() <= begin.valueOf() ? inc : next
            });
        });
    });
}

function minDate(d1, d2) {
    return d1 && d1.valueOf() < d2.valueOf() || !d2 ? d1 : d2;
}

function maxDate(d1, d2) {
    return d1 && d1.valueOf() > d2.valueOf() || !d2 ? d1 : d2;
}

function loadFilteredPoint(load, period, filters, asof) {
    var expressions = _.map(filters,  _.compose(_.property('expression'), _.property('indicator')));
    return load(asof, period, expressions).then(function(data){
        if (!data.result) return Promise.reject(_.extend(data, {
            status: 'error',
            message: "No results for interval: " + period.interval,
            interval: period.interval
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
            return _.extend(data, {
                status: 'failure'
            });
        }
    });
}

function loadData(parseCalculation, open, failfast, security, length, lower, upper, period, expressions) {
    var calcs = asCalculation(parseCalculation, expressions);
    var n = _.max(_.invoke(calcs, 'getDataLength'));
    var errorMessage = _.first(_.compact(_.invoke(calcs, 'getErrorMessage')));
    if (errorMessage) throw Error(errorMessage);
    return collectIntervalRange(open, failfast, security, period, length + n - 1, lower, upper).then(function(data) {
        var updates = [];
        var startIndex = Math.max(lengthBelow(data.result, lower) - length, 0);
        var result = _.map(startIndex ? data.result.slice(startIndex) : data.result, function(result, i) {
            var updated = false;
            var point = _.reduce(calcs, function(point, calc, c){
                if (_.isUndefined(point[expressions[c]])) {
                    var points = preceding(data.result, calc.getDataLength(), startIndex + i);
                    var value = calc.getValue(points);
                    if (_.isNumber(value)) {
                        point[expressions[c]] = value;
                        updated = true;
                    }
                }
                return point;
            }, result);
            if (updated) {
                updates.push(point);
            }
            return point;
        });
        if (updates.length) {
            return storeData(open, security, period, updates).then(_.constant(_.extend(data, {
                result: result
            })));
        }
        return _.extend(data, {
            result: result
        });
    });
}

function collectIntervalRange(open, failfast, security, period, length, lower, upper) {
    if (!period.derivedFrom)
        return collectRawRange(open, failfast, security, period, length, lower, upper);
    return open(security, period, 'readonly', collect.bind(this, length, lower, upper)).then(function(result){
        var next = result.length ? period.inc(result[result.length - 1].asof, 1) : null;
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
            return collectAggregateRange(open, failfast, security, period, 0, last.asof, upper).then(function(aggregated){
                return storeData(open, security, period, aggregated.result).then(_.constant(aggregated));
            }).then(function(aggregated){
                return _.extend(aggregated, {
                    result: result.concat(aggregated.result)
                });
            });
        } else {
            // no data available
            var floored = period.floor(lower);
            return collectAggregateRange(open, failfast, security, period, length, floored, upper).then(function(aggregated){
                return storeData(open, security, period, aggregated.result).then(_.constant(aggregated));
            });
        }
    });
}

function collectAggregateRange(open, failfast, security, period, length, lower, upper) {
    var ceil = period.ceil;
    var end = ceil(upper).valueOf() == upper.valueOf() ? upper : period.floor(upper);
    var size = period.aggregate * length + 1;
    return collectRawRange(open, failfast, security, period.derivedFrom, size, lower, end).then(function(data){
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
                    total_volume: point.total_volume,
                    high: Math.max(preceding.high, point.high),
                    low: Math.min(preceding.low, point.low),
                    volume: period.interval.charAt(0) == 'd' ?
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

function collectRawRange(open, failfast, security, period, length, lower, upper) {
    return open(security, period, 'readonly', collect.bind(this, length, lower, upper)).then(function(result){
        var conclude = failfast ? Promise.reject.bind(Promise) : Promise.resolve.bind(Promise);
        var next = result.length ? period.inc(result[result.length - 1].asof, 1) : null;
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
                        interval: period.interval,
                        result: result,
                        start: period.format(result[result.length - 1].asof)
                    }]
                });
            });
        } else if (result.length && below < length) {
            var earliest = lower.valueOf() < result[0].asof.valueOf() ? lower : result[0].asof;
            // need more historic data
            var quote = [{
                security: security,
                interval: period.interval,
                start: period.format(period.dec(earliest, 2 * (length - below))),
                end: period.format(result[0].asof)
            }];
            if (next.valueOf() < upper.valueOf()) {
                quote.push({
                    security: security,
                    interval: period.interval,
                    start: period.format(result[result.length - 1].asof)
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
                var d1 = period.dec(lower, length);
                var d2 = earliest ? moment(earliest.asof) : d1;
                var start = d1.valueOf() < d2.valueOf() ? d1 : d2;
                return Promise.reject({
                    status: 'error',
                    message: 'No data points available',
                    quote: [{
                        security: security,
                        interval: period.interval,
                        start: period.format(start)
                    }]
                });
            });
        }
    });
}

function importData(open, period, security, result) {
    var now = Date.now();
    var points = result.map(function(point){
        var obj = {};
        var tz = point.tz || period.tz;
        if (point.dateTime) {
            obj.asof = moment.tz(point.dateTime, tz).toDate();
        } else if (point.date) {
            var time = point.date + ' ' + period.marketClosesAt;
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
    return storeData(open, security, period, points).then(function(){
        return {
            status: 'success'
        };
    });
}

function storeData(open, security, period, data) {
    if (!data.length) return Promise.resolve(data);
    console.log("Storing", data.length, period.interval, security, data[data.length-1]);
    return open(security, period, "readwrite", function(store, resolve, reject){
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

function openSymbolDatabase(indexedDB, storeNames, security, period, mode, callback) {
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
                var trans = db.transaction(period.storeName, mode);
                return callback(trans.objectStore(period.storeName), resolve, reject);
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

function validateExpressions(parseCalculation, intervals, data) {
    var calc = parseCalculation(data.expression);
    var errorMessage = calc.getErrorMessage();
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

function asCalculation(parseCalculation, expressions) {
    return _.map(expressions, function(expr){
        return parseCalculation(expr);
    });
}

function createPeriod(intervals, interval, exchange) {
    if (!exchange || !exchange.tz) throw Error("Missing exchange");
    var period = intervals[interval];
    var self = {};
    return period && _.extend(self, period, {
        interval: period.storeName,
        tz: exchange.tz,
        marketClosesAt: exchange.marketClosesAt,
        derivedFrom: period.derivedFrom && createPeriod(intervals, period.derivedFrom.storeName, exchange),
        floor: function(date) {
            return period.floor(exchange, date).toDate();
        },
        ceil: function(date) {
            return period.ceil(exchange, date).toDate();
        },
        inc: function(date, n) {
            return period.inc(exchange, date, n).toDate();
        },
        dec: function(date, n) {
            return period.dec(exchange, date, n).toDate();
        },
        format: function(date) {
            return moment.tz(date, exchange.tz).format();
        }
    });
}
