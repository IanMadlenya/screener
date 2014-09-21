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

importScripts('../assets/moment/moment-with-langs.js');
var window = { moment: moment };
importScripts('../assets/moment/moment-timezone.js');
importScripts('../assets/moment/moment-timezone-data.js');

importScripts('utils.js');
importScripts('calculations.js'); // getCalculations

self.addEventListener("connect", _.partial(function(calculations, event) {
    var d1 = {
        storeName: 'd1',
        millis: 24 * 60 * 60 * 1000,
        inc: function(exchange, dateTime, amount) {
            var start = moment(dateTime).tz(exchange.tz).startOf('day');
            if (start.valueOf() < dateTime.valueOf())
                return d1.inc(exchange, start, amount + 1);
            var w = amount > 0 ? Math.floor(amount / 5) : Math.ceil(amount / 5);
            var d = amount - w * 5;
            var day = start.add('weeks', w);
            if (d < 1 || day.isoWeekday() + d < 6) {
                return day.add('days', d);
            } else {
                // skip over weekend
                return day.add('days', d + 2);
            }
        }
    };
    var m15 = {
        storeName: 'm15',
        millis: 15 * 60 * 1000,
        inc: function(exchange, dateTime, amount) {
            var start = moment(dateTime).tz(exchange.tz).startOf('minute');
            if (start.valueOf() < dateTime.valueOf()) {
                start = start.add('minutes', 1);
            }
            var minutes = start.minutes();
            if (minutes % 15 === 0)
                return m1.inc(exchange, start, amount * 15);
            if (minutes < 45)
                return m1.inc(exchange, start.minutes(Math.ceil(minutes/15)*15), amount * 15);
            return m1.inc(exchange, start.minutes(0).add('hours', 1), amount * 15);
        }
    };
    var m1 = {
        storeName: 'm1',
        millis: 60 * 1000,
        inc: function(exchange, dateTime, amount) {
            var start = moment(dateTime).tz(exchange.tz).startOf('minute');
            if (start.valueOf() < dateTime.valueOf())
                return m1.inc(exchange, start, amount + 1);
            var offset = start.hour() * 60 + start.minute();
            var days = amount > 0 ? Math.floor(amount / (6.5 * 60)) : Math.ceil(amount / (6.5 * 60));
            var m = amount - days * (6.5 * 60);
            if (days !== 0)
                return d1.inc(exchange, start.startOf('day'), days).add('minutes', offset + m);
            return start.add('minutes', m);
        }
    };
    var intervals = {
        annual: {
            storeName: 'annual',
            millis: 365 * 24 * 60 * 60 * 1000,
            inc: function(exchange, dateTime, amount) {
                var start = moment(dateTime).tz(exchange.tz).startOf('year');
                if (start.valueOf() < dateTime.valueOf())
                    return start.add('years', amount + 1);
                return start.add('years', amount);
            }
        },
        quarter: {
            storeName: 'quarter',
            millis: 3 * 31 * 24 * 60 * 60 * 1000,
            inc: function(exchange, dateTime, amount) {
                var start = moment(dateTime).tz(exchange.tz).startOf('quarter');
                if (start.valueOf() < dateTime.valueOf())
                    return start.add('months', 3 * (amount + 1));
                return start.add('months', 3 * amount);
            }
        },
        d1: d1,
        m15: m15,
        m1: m1,
        d5: {
            derivedFrom: d1,
            storeName: 'd5',
            aggregate: 5,
            millis: 7 * 24 * 60 * 60 * 1000,
            inc: function(exchange, dateTime, amount) {
                var start = moment(dateTime).tz(exchange.tz).startOf('isoweek');
                if (start.valueOf() < dateTime.valueOf())
                    return start.add('weeks', amount + 1);
                return start.add('weeks', amount);
            }
        },
        m60: {
            derivedFrom: m15,
            storeName: 'm60',
            aggregate: 4,
            millis: 60 * 60 * 1000,
            inc: function(exchange, dateTime, amount) {
                var start = moment(dateTime).tz(exchange.tz).startOf('hour');
                if (start.valueOf() < dateTime.valueOf())
                    return start.add('hours', amount + 1);
                return start.add('hours', amount);
            }
        },
        m30: {
            derivedFrom: m15,
            storeName: 'm30',
            aggregate: 2,
            millis: 30 * 60 * 1000,
            inc: function(exchange, dateTime, amount) {
                var start = moment(dateTime).tz(exchange.tz).startOf('minute');
                if (start.valueOf() < dateTime.valueOf()) {
                    start = start.add('minutes', 1);
                }
                var minutes = start.minutes();
                if (minutes % 30 === 0)
                    return m1.inc(exchange, start, amount * 30);
                if (minutes < 30)
                    return m1.inc(exchange, start.minutes(30), amount * 30);
                return m1.inc(exchange, start.minutes(0).add('hours', 1), amount * 30);
            }
        },
        m10: {
            derivedFrom: m1,
            storeName: 'm10',
            aggregate: 10,
            millis: 10 * 60 * 1000,
            inc: function(exchange, dateTime, amount) {
                var start = moment(dateTime).tz(exchange.tz).startOf('minute');
                if (start.valueOf() < dateTime.valueOf()) {
                    start = start.add('minutes', 1);
                }
                var minutes = start.minutes();
                if (minutes % 10 === 0)
                    return m1.inc(exchange, start, amount * 10);
                if (minutes < 50)
                    return m1.inc(exchange, start.minutes(Math.ceil(minutes/10)*10), amount * 10);
                return m1.inc(exchange, start.minutes(0).add('hours', 1), amount * 10);
            }
        },
        m5: {
            derivedFrom: m1,
            storeName: 'm5',
            aggregate: 5,
            millis: 5 * 60 * 1000,
            inc: function(exchange, dateTime, amount) {
                var start = moment(dateTime).tz(exchange.tz).startOf('minute');
                if (start.valueOf() < dateTime.valueOf()) {
                    start = start.add('minutes', 1);
                }
                var minutes = start.minutes();
                if (minutes % 5 === 0)
                    return m1.inc(exchange, start, amount * 5);
                if (minutes < 55)
                    return m1.inc(exchange, start.minutes(Math.ceil(minutes/5)*5), amount * 5);
                return m1.inc(exchange, start.minutes(0).add('hours', 1), amount * 5);
            }
        }
    };
    var open = _.partial(openSymbolDatabase, indexedDB, _.map(intervals, 'storeName'));
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
            return data.exchanges.reduce(function(memo, exchange){
                var next = interval.inc(exchange, data.asof, data.increment || 1);
                if (memo && memo.valueOf() < next.valueOf()) return memo;
                return next.toDate();
            }, null);
        },

        'import': function(event) {
            return importData(open, intervals[event.data.period], Date.now(), event.data);
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
            var now = Date.now();
            return loadData(calculations, open, now,
                data.asof, data.exchange, data.security, data.failfast,
                data.expressions, data.length, intervals[data.interval]
            );
        },
        screen: function(event){
            var data = event.data;
            var now = Date.now();
            var load = loadFilteredPoint.bind(this, calculations, open, now,
                data.failfast, data.asof);
            return filterSecurity(intervals, load, data.exchange, data.security, data.screens);
        }
    });
}, getCalculations()), false);

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

function importData(open, interval, now, data) {
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
    console.log("Storing", points.length, interval.storeName, data.security);
    return storeData(open, data.security, interval, points).then(function(){
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

function filterSecurity(intervals, load, exchange, security, screens){
    return Promise.all(screens.map(function(screen) {
        return reduceFilters(intervals, screen.filters, function(promise, filters, interval){
            return promise.then(function(memo){
                if (!memo) return memo;
                return load(exchange, security, filters, interval).then(function(point){
                    if (!point) return point;
                    return {
                        status: !memo.status || memo.status == point.status ? point.status : 'warning',
                        quote: _.compact(_.flatten([memo.quote, point.quote])),
                        result: _.extend(memo.result || {
                            security: security
                        }, point.result)
                    };
                });
            });
        }, Promise.resolve({}));
    })).then(function(orResults) {
        return orResults.reduce(function(memo, point) {
            return memo || point;
        }, null);
    }).then(function(point){
        // if no screens are provide, just return the security
        return !_.isEmpty(point) && point || screens.length === 0 && {
            status: 'success',
            result: {security: security}
        } || {status: 'success'};
    });
}

function reduceFilters(intervals, filters, iterator, memo){
    var getInterval = _.compose(_.property('interval'), _.property('indicator'));
    var byInterval = _.groupBy(filters, getInterval);
    var sorted = _.sortBy(_.keys(byInterval), function(interval) {
        return intervals[interval].millis;
    }).reverse();
    return _.reduce(sorted, function(memo, interval){
        return iterator(memo, byInterval[interval], intervals[interval]);
    }, memo);
}

function loadFilteredPoint(calculations, open, now, failfast, asof, exchange, security, filters, interval) {
    var expressions = _.map(filters,  _.compose(_.property('expression'), _.property('indicator')));
    return loadData(calculations, open, now, asof, exchange, security, failfast, expressions, 1, interval).then(function(data){
        if (data.result.length < 1) return Promise.reject(_.extend(data, {
            status: 'error',
            message: "No results for interval: " + interval.storeName,
            interval: interval.storeName
        }));
        return _.extend(data, {
            result: data.result[data.result.length - 1]
        });
    }).then(function(data){
        var pass = _.reduce(filters, function(pass, filter) {
            if (!pass)
                return false;
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

function evaluateExpressions(calculations, open, failfast, security, exchange, interval, length, asof, now, expressions) {
    var calcs = asCalculation(calculations, expressions);
    var n = _.max(_.invoke(calcs, 'getDataLength'));
    var errorMessage = _.first(_.compact(_.invoke(calcs, 'getErrorMessage')));
    if (errorMessage) throw Error(errorMessage);
    return collectIntervalRange(open, failfast, security, exchange, interval, length + n - 1, asof, now).then(function(data) {
        var startIndex = Math.max(data.result.length - length, 0);
        var updates = [];
        var result = _.map(data.result.slice(startIndex), function(result, i) {
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

function collectIntervalRange(open, failfast, security, exchange, interval, length, asof, now) {
    if (!interval.derivedFrom)
        return collectRawRange(open, failfast, security, exchange, interval, length, asof, now);
    return open(security, interval, 'readonly', function(store, resolve, reject){
        var cursor = store.openCursor(IDBKeyRange.upperBound(asof), "prev");
        cursor.onerror = reject;
        cursor.onsuccess = collect(length, resolve, reject);
    }).then(function(result){
        result = result.reverse();
        var inc = interval.inc.bind(interval, exchange);
        var next = result.length ? inc(result[result.length - 1].asof, 1) : null;
        var ticker = decodeURI(security.substring(exchange.iri.length + 1));
        if (result.length >= length && (next.valueOf() > asof.valueOf() || next.valueOf() > now)) {
            // result complete
            return {
                status: 'success',
                result: result
            };
        } else if (result.length >= length) {
            // need to update with newer data
            var last = result[result.length - 1];
            var size = Math.ceil((asof.valueOf() - last.asof.valueOf()) / interval.millis);
            return collectAggregateRange(open, failfast, security, exchange, interval, size, last.asof, asof, now).then(function(aggregated){
                return _.extend(aggregated, {
                    result: aggregated.result.slice(_.sortedIndex(aggregated.result, last, 'asof') + 1)
                });
            }).then(function(aggregated){
                return storeData(open, security, interval, aggregated.result).then(_.constant(aggregated));
            }).then(function(aggregated){
                return _.extend(aggregated, {
                    result: result.concat(aggregated.result)
                });
            });
        } else {
            // no data available
            return collectAggregateRange(open, failfast, security, exchange, interval, length, null, asof, now).then(function(aggregated){
                return storeData(open, security, interval, aggregated.result).then(_.constant(aggregated));
            });
        }
    });
}

function collectAggregateRange(open, failfast, security, exchange, interval, length, since, asof, now) {
    var ceil = _.partial(interval.inc, exchange, _, 0);
    var end = ceil(asof).valueOf() == asof.valueOf() ? asof : interval.inc(exchange, asof, -1).toDate();
    var size = interval.aggregate * length;
    return collectRawRange(open, failfast, security, exchange, interval.derivedFrom, size, end, now).then(function(data){
        if (!since) return data;
        return _.extend(data, {
            result: data.result.slice(_.sortedIndex(data.result, {asof: since}, 'asof') + 1)
        });
    }).then(function(data){
        if (!data.result.length) return data;
        var upper, count;
        var result = data.result.reduce(function(result, point){
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

function collectRawRange(open, failfast, security, exchange, period, length, asof, now) {
    return open(security, period, 'readonly', function(store, resolve, reject){
        var cursor = store.openCursor(IDBKeyRange.upperBound(asof), "prev");
        cursor.onerror = reject;
        cursor.onsuccess = collect(length, resolve, reject);
    }).then(function(result){
        result = result.reverse();
        var conclude = failfast ? Promise.reject.bind(Promise) : Promise.resolve.bind(Promise);
        var inc = period.inc.bind(period, exchange);
        var next = result.length ? inc(result[result.length - 1].asof, 1) : null;
        var ticker = decodeURI(security.substring(exchange.iri.length + 1));
        if (result.length >= length && (next.valueOf() > asof.valueOf() || next.valueOf() > now)) {
            // result complete
            return {
                status: 'success',
                result: result
            };
        } else if (result.length >= length) {
            return open(security, period, 'readonly', function(store, resolve, reject){
                var cursor = store.openCursor(IDBKeyRange.lowerBound(asof), "next");
                cursor.onerror = reject;
                cursor.onsuccess = collect(1, resolve, reject);
            }).then(function(newer){
                if (newer.length) return { // result complete
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
                        start: inc(result[result.length - 1].asof, -1).format(),
                        end: moment(now).tz(exchange.tz).format()
                    }]
                });
            });
        } else if (result.length && result.length < length) {
            // need more historic data
            var quote = [{
                security: security,
                exchange: exchange,
                ticker: ticker,
                period: period.storeName,
                result: result,
                start: inc(result[0].asof, -2 * (length - result.length)).format(),
                end: inc(result[0].asof, -1).format()
            }];
            if (next.valueOf() < asof.valueOf()) {
                quote.push({
                    security: security,
                    exchange: exchange,
                    ticker: ticker,
                    period: period.storeName,
                    start: inc(result[result.length - 1].asof, -1).format(),
                    end: moment(now).tz(exchange.tz).format()
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
            return open(security, period, 'readonly', function(store, resolve, reject){
                var cursor = store.openCursor();
                cursor.onerror = reject;
                cursor.onsuccess = collect(1, resolve, reject);
            }).then(function(arrayOfOne){
                var earliest = arrayOfOne.length ? arrayOfOne[0] : null;
                var d1 = inc(asof, -length);
                var d2 = earliest ? inc(earliest.asof, -1) : d1;
                var start = d1.valueOf() < d2.valueOf() ? d1 : d2;
                return Promise.reject({
                    status: 'error',
                    message: 'No data points available',
                    quote: [{
                        security: security,
                        exchange: exchange,
                        ticker: ticker,
                        period: period.storeName,
                        start: start.format(),
                        end: moment(now).tz(exchange.tz).format()
                    }]
                });
            });
        }
    });
}

function storeData(open, security, interval, data) {
    if (!data.length) return Promise.resolve(data);
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
        var request = indexedDB.open(security, 3);
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

function collect(n, callback, catcher) {
    return _.partial(function(results, event) {
        try {
            var cursor = event.target.result;
            if (cursor) {
                results.push(cursor.value);
                if (!_.isNumber(n) || results.length < n) {
                    cursor.continue();
                    return;
                }
            }
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
