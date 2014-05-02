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

importScripts('../assets/underscore/underscore.js'); // _

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
                return {
                    status: 'success',
                    result: _.uniq(_.flatten(_.invoke(calcs, 'getFields')))
                };
            } else {
                throw new Error(errorMessage);
            }
        },

        validate: function(event) {
            return validateExpressions(calculations, intervals, event.data);
        },
        'import': function(event) {
            return importData(open.bind(this, intervals), event.data);
        },
        load: function(event) {
            return loadData(calculations, open.bind(this, intervals), event.data);
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

function importData(open, data) {
    return open(data.security).then(function(db) {
        var store = db.transaction([data.interval], "readwrite").objectStore(data.interval);
        return Promise.all(data.points.map(function(point){
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

function loadData(calculations, open, data) {
    return evaluateExpressions(calculations, open,
            data.security, data.interval, data.after, data.before, data.expressions
    ).then(function(result) {
        return {
            status: 'success',
            result: result
        };
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

function evaluateExpressions(calculations, open, security, interval, after, before, expressions) {
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
        var fields = _.uniq(_.flatten(_.invoke(calcs, 'getFields')));
        var start = earlier(interval, n - 1, after);
        return collectRange(fields, interval, start, before, store);
    }).then(function(results) {
        var startIndex = after ? findIndex(results, function(result){
            return result.asof >= after;
        }) : n - 1;
        return _.map(_.range(startIndex, results.length), function(i) {
            return _.map(calcs, function(calc){
                var points = preceding(results, calc.getDataLength(), i);
                return calc.getValue(points);
            });
        });
    });
}

function collectRange(fields, interval, start, end, store) {
    return new Promise(function(resolve, reject){
        var earliest, latest;
        store.openCursor().onsuccess = collect(1, function(arrayOfOne){
            earliest = arrayOfOne.length ? arrayOfOne[0] : null;
            then();
        });
        store.openCursor(null, "prev").onsuccess = collect(1, function(arrayOfOne){
            latest = arrayOfOne.length ? arrayOfOne[0] : null;
            then();
        });
        var then = _.after(2, function(){
            if (earliest && latest) {
                var sorted = [earliest.asof, start || earliest.asof, end, latest.asof].sort(function(a, b){
                    return a.getTime() - b.getTime();
                });
                var first = _.first(sorted);
                var last = _.last(sorted);
                if (first == earliest.asof && last == latest.asof) {
                    // range already present
                    store.openCursor(IDBKeyRange.bound(start || earliest.asof, end)).onsuccess = collect(resolve);
                } else {
                    // need more points
                    reject({
                        status: 'error',
                        message: 'Need more data points',
                        from: first != earliest.asof ? earlier(interval, 4, first) : latest.asof,
                        to: last != latest.asof ? last : earliest.asof,
                        fields: fields,
                        earliest: earliest.asof,
                        latest: latest.asof
                    });
                }
            } else { // store is empty
                reject({
                    status: 'error',
                    message: 'No data points available',
                    from: earlier(interval, 4, start || end),
                    to: end,
                    fields: fields
                });
            }
        });
    });
}

function collect(n, callback) {
    return _.partial(function(results, event) {
        var cursor = event.target.result;
        if (cursor) {
            results.push(cursor.value);
            if (!_.isNumber(n) || results.length < n) {
                cursor.continue();
                return;
            }
        }
        if (_.isFunction(callback)) {
            callback(results);
        } else if (_.isFunction(n)) {
            n(results);
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

function earlier(interval, n, first) {
    if (!first) return null;
    var unit;
    if (interval == 'm12') {
        var clone = new Date(first.valueOf());
        clone.setFullYear(clone.getFullYear() - 1);
        return clone;
    } else if (interval.indexOf('d') === 0) {
        unit = parseInt(interval.substring(1), 10) * 2 * 24 * 60 * 60 * 1000;
    } else if (interval.indexOf('w')) {
        unit = parseInt(interval.substring(1), 10) * 7 * 24 * 60 * 60 * 1000;
    } else if (interval.indexOf('m')) {
        unit = parseInt(interval.substring(1), 10) * 31 * 24 * 60 * 60 * 1000;
    } else if (interval.indexOf('s')) {
        unit = parseInt(interval.substring(1), 10) * 1000;
    } else if (interval.indexOf('t')) {
        // assume any number of ticks is within a days
        unit = 24 * 60 * 60 * 1000;
    } else {
        throw new Error("Unknown interval: " + interval);
    }
    return new Date(first.valueOf() - n * unit);
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
            if (_.isObject(result) && _.isObject(event.data)) {
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
