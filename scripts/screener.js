// screener.js
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

(function($){

    var screener = window.screener = (function(postDispatchMessage){
        return _.extend(window.screener || {}, {

            getBacktestAsOfDateString: function() {
                var date = screener.getBacktestAsOf();
                return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
            },

            setBacktestAsOfDateString: function(localDateString){
                screener.setBacktestAsOf(localDateString);
            },
    
            getBacktestAsOf: function() {
                var date = screener.getItem('backtest-as-of');
                if (!date)
                    return new Date();
                try {
                    var ms = parseInt(date, 10);
                    return isNaN(ms) && new Date() || new Date(ms);
                } catch (e) {
                    console.log("Invalid date: ", date);
                    return new Date();
                }
            },
    
            setBacktestAsOf: function(dateOrLocalString) {
                var date = _.isString(dateOrLocalString) ? parseAsOf(dateOrLocalString) : dateOrLocalString;
                if (_.isDate(date) && date.valueOf() > Date.now() - 60 * 60 * 1000) {
                    screener.removeItem('backtest-as-of');
                } else if (_.isDate(date)) {
                    screener.setItem('backtest-as-of', date.valueOf());
                } else {
                    throw new Error("Not a Date object: " + date);
                }
            },

            getItem: function(key, defaultValue) {
                return sessionStorage.getItem(key) ||
                    localStorage.getItem(key) ||
                    typeof defaultValue == 'function' && defaultValue() ||
                    defaultValue;
            },
        
            setItem: function(key, value) {
                sessionStorage.setItem(key, value);
                localStorage.setItem(key, value);
            },
        
            removeItem: function(key) {
                sessionStorage.removeItem(key);
                localStorage.removeItem(key);
            },

            debouncePromise: function(func, wait) {
                var end = Promise.resolve();
                return function(/* arguments */) {
                    var context = this;
                    var args = arguments;
                    var current = end = end.catch(function() {
                        // ignore previous error
                    }).then(function(){
                        if (current === end) return new Promise(function(resolve){
                            _.delay(resolve, wait); // wait for another call
                        });
                    }).then(function() {
                        if (current === end) // no other calls
                            return func.apply(context, args);
                    });
                    return theEnd(current);
                };
                function theEnd(current){
                    return end.then(function(resolved){
                        if (resolved !== undefined || current === end)
                            return Promise.resolve(resolved);
                        return theEnd(end); // return the very last one
                    });
                }
            },

            pceil: function(x, precision) {
                if (x === 0 || !_.isNumber(x))
                    return x;
                var ex = Math.floor(Math.log(Math.abs(x))/Math.log(10)) - precision + 1;
                var div = Math.pow(10, Math.abs(ex));
                if (ex > 0) return Math.ceil(x / div) * div;
                if (ex < 0) return Math.ceil(x * div) / div;
                return Math.ceil(x);
            },

            formatNumber: suffixScale.bind(this, _.memoize(getScaleSuffix)),

            validate: function(expression, interval) {
                var int = interval && interval.indexOf('/') ? interval.substring(interval.lastIndexOf('/') + 1) : interval;
                return postDispatchMessage({
                    cmd: 'validate',
                    expression: expression,
                    interval: int
                });
            },

            listExchanges: _.memoize(function(){
                return postDispatchMessage('exchange-list');
            }),

            listSectors: _.memoize(function(exchange) {
                if (!exchange) return Promise.resolve([]);
                return getExchange(exchange).then(function(exchange){
                    return postDispatchMessage({
                        cmd: 'sector-list',
                        exchange: exchange
                    });
                });
            }),

            listSecurities: function(exchange, sectors, mincap, maxcap) {
                return getExchange(exchange).then(function(exchange){
                    return Promise.all((_.isString(sectors) ? [sectors] : sectors).map(function(sector){
                        return postDispatchMessage({
                            cmd: 'security-list',
                            exchange: exchange,
                            sector: sector,
                            mincap: mincap,
                            maxcap: maxcap
                        });
                    })).then(_.flatten);
                });
            },

            listIndicators: _.memoize(function(){
                return postDispatchMessage('indicator-list');
            }),

            listWatchLists: function(){
                return postDispatchMessage('watch-list');
            },

            listScreens: function() {
                return postDispatchMessage('screen-list').then(function(list) {
                    return _.groupBy(list, 'iri');
                }).then(function(grouped){
                    return _.map(grouped, function(filters){
                        var dir = filters[0].forDirection;
                        return {
                            iri: filters[0].iri,
                            label: filters[0].label,
                            direction: dir.substring(dir.lastIndexOf('/') + 1),
                            filters: filters
                        };
                    });
                });
            },

            exchangeLookup: _.memoize(function() {
                return typeaheadSource(function(resolve, reject) {
                    return screener.listExchanges().then(function(datums){
                        return { local: _.values(datums) };
                    }).then(resolve, reject);
                });
            }),

            indicatorLookup: _.memoize(function() {
                return typeaheadSource(function(resolve, reject) {
                    return screener.listIndicators().then(function(datums){
                        return { local: _.values(datums) };
                    }).then(resolve, reject);
                });
            }),

            watchListLookup: _.memoize(function() {
                return typeaheadSource(function(resolve, reject) {
                    return screener.listWatchLists().then(function(datums){
                        return { local: _.values(datums) };
                    }).then(resolve, reject);
                });
            }),

            screenLookup: _.memoize(function() {
                return typeaheadSource(function(resolve, reject) {
                    return screener.listScreens().then(function(datums){
                        return {
                            datumTokenizer: function(d) {
                                var filterValues = _.filter(_.flatten(_.map(d.filters, _.values)), _.isString);
                                return _.flatten(_.map(filterValues, Bloodhound.tokenizers.whitespace));
                            },
                            local: _.values(datums)
                        };
                    }).then(resolve, reject);
                });
            }),

            resetSecurity: function(security){
                return getExchangeOfSecurity(security).then(function(exchange){
                    return postDispatchMessage({
                        cmd: 'reset',
                        exchange: exchange,
                        security: security
                    });
                });
            },

            load: function(security, expressions, interval, length, asof) {
                if (length <= 0 || length != Math.round(length)) throw Error("length must be a positive integer, not " + length);
                var int = interval.indexOf('/') ? interval.substring(interval.lastIndexOf('/') + 1) : interval;
                return getExchangeOfSecurity(security).then(function(exchange){
                    return postDispatchMessage({
                        cmd: 'load',
                        exchange: exchange,
                        security: security,
                        expressions: expressions,
                        interval: int,
                        length: length,
                        asof: asof
                    });
                });
            },

            /*
             * watchLists: [{ofExchange:$iri, includes:[$ticker]}]
             * screens: [{filters:[{indicator:{expression:$expression, interval: $interval}}]}]
             * asof: new Date()
             * load:
             * * When false, don't load anything and reject on any error, but include result (if available) as warning
             * * When undefined, load if needed and treat warning as success
             * * When true, if load attempted and all loading attempts failed then error, if any (or none) loaded, treat warning as success
            */
            screen: function(watchLists, screens, asof, load) {
                var next = 0;
                var iterating = [asof];
                var promise = Promise.resolve();
                var message = inlineScreenMessage(watchLists, screens, load);
                var push = pushIncrementedAsof.bind(this, message, postDispatchMessage, [], iterating);
                return {
                    next: function(){
                        var index = next++;
                        promise = promise.catch(function(){
                            // ignore previous errors
                        }).then(function(){
                            return message.then(function(data){
                                return postThenPush(postDispatchMessage, push, load, data, iterating, index);
                            });
                        });
                        return {
                            value: promise,
                            done: false
                        };
                    }
                };
            }

        });
    })(synchronized(postMessage.bind(this, _.once(createDispatchPort))));

    function inlineScreenMessage(watchLists, screens, load) {
        return Promise.all(watchLists.map(inlineWatchList)).then(function(watchLists) {
            return Promise.all(watchLists.map(inlineExchangeIncludeExclude));
        }).then(function(watchLists) {
            return Promise.all(screens.map(inlineScreen)).then(function(screens){
                return Promise.all(screens.map(inlineIndicator));
            }).then(function(screens){
                var filters = ['asof', 'open', 'close'].map(function(expression){
                    return {
                        indicator: {
                            expression: expression,
                            interval: 'd1'
                        }
                    };
                });
                return screens.map(function(screen){
                    return _.extend({}, screen, {
                        filters: [].concat(screen.filters, filters)
                    });
                });
            }).then(function(screens){
                return {
                    cmd: 'screen',
                    watchLists: watchLists,
                    screens: screens,
                    load: load
                };
            });
        });
    }

    function pushIncrementedAsof(message, postDispatchMessage, exchanges, iterating, asof, result){
        return message.then(function(data){
            if (!exchanges.length) {
                _.values(_.indexBy(_.pluck(data.watchLists, 'exchange'), 'iri')).reduce(function(exchanges, exchange){
                    exchanges.push(exchange);
                }, exchanges);
            }
        }).then(function(){
            return postDispatchMessage({
                cmd: 'increment',
                asof: result && result.length && result[0].asof || asof,
                interval: 'd1',
                exchanges: exchanges
            });
        }).then(function(incremented){
            if (incremented.valueOf() > asof.valueOf()) {
                iterating.push(incremented);
                return Promise.resolve(result);
            }
            return postDispatchMessage({
                cmd: 'increment',
                asof: asof,
                interval: 'd1',
                exchanges: exchanges
            }).then(function(incremented){
                iterating[iterating.length - 1] = incremented;
            }).then(function(){
                return Promise.reject(result);
            });
        });
    }

    function postThenPush(postDispatchMessage, push, load, data, iterating, index){
        var asof = iterating[index];
        return new Promise(function(callback){
            var now = Date.now();
            if (asof.valueOf() <= now) return callback();
            setTimeout(callback, asof.valueOf() - now);
        }).then(function(){
            return postDispatchMessage(_.extend({
                asof: asof
            }, data));
        }).then(function(result){
            return push(asof, result).catch(function(){
                return postThenPush(postDispatchMessage, push, load, data, iterating, index);
            });
        }, function(error){
            return push(asof, error).then(function(error){
                if (error.status == 'warning' && load !== false)
                    return error.result;
                // tell caller to try again with load = true
                return Promise.reject(error);
            }, function(){
                return postThenPush(postDispatchMessage, push, load, data, iterating, index);
            });
        });
    }

    function getExchange(iri) {
        return screener.exchangeLookup()(iri).then(onlyOne(iri));
    }

    function getExchangeOfSecurity(security) {
        return screener.listExchanges().then(function(exchanges){
            var filtered = _.values(exchanges).filter(function(exchange){
                return security.indexOf(exchange.iri) === 0 && security.charAt(exchange.iri.length) == '/';
            });
            if (filtered.length == 1) return filtered[0];
            if (filtered.length) throw Error("Security matches too many exchanges: " + filtered);
            throw Error("Unknown security: " + security);
        });
    }

    function inlineWatchList(hasWatchList) {
        return screener.watchListLookup()(hasWatchList).then(onlyOne(hasWatchList));
    }

    function inlineExchangeIncludeExclude(watchList) {
        if (!watchList.ofExchange && !watchList.exchange) throw Error("No watch list exchange: " + JSON.stringify(watchList));
        return getExchange(watchList.exchange || watchList.ofExchange).then(function(exchange){
            var s = watchList.includeSectors;
            var sectors = s ? _.isString(s) ? _.compact(s.split('\t')) : s : [];
            var i = watchList.includes;
            var includes = i ? _.isString(i) ? _.compact(i.split(' ')) : i : [];
            var e = watchList.excludes;
            var excludes = e ? _.isString(e) ? _.compact(e.split(' ')) : e : [];
            var prefix = function(security){
                if (security.indexOf('://') > 0) return security;
                return exchange.iri + '/' + encodeURI(security);
            };
            return _.extend({}, watchList, {
                exchange: exchange,
                includeSectors: sectors,
                includes: includes.map(prefix),
                excludes: excludes.map(prefix)
            });
        });
    }

    function inlineScreen(screen) {
        return screener.screenLookup()(screen).then(onlyOne(screen));
    }

    function inlineIndicator(screen) {
        return Promise.all(screen.filters.map(function(filter){
            var indicator = filter.indicator || filter.forIndicator;
            return screener.indicatorLookup()(indicator).then(onlyOne(indicator)).then(function(indicator){
                var int = indicator.hasInterval;
                var interval = int && int.indexOf('/') ? int.substring(int.lastIndexOf('/') + 1) : int;
                var min = indicator.min;
                var max = indicator.max;
                return _.extend({}, filter, {
                    indicator: _.extend({
                        interval: interval
                    }, indicator, {
                        min: _.isString(min) ? parseInt(min, 10) : min,
                        max: _.isString(max) ? parseInt(max, 10) : max
                    })
                });
            });
        })).then(function(filters){
            return _.extend({}, screen, {
                filters: filters
            });
        });
    }

    function typeaheadSource(options) {
        var bloodhound = new Promise(options).then(createBloodhound).then(function(bloodhound){
            bloodhound.initialize();
            return bloodhound;
        });
        return function(query, callback) {
            if (!_.isString(query)) return Promise.resolve([query]);
            return bloodhound.then(function(bloodhound) {
                return new Promise(function(callback) {
                    bloodhound.get(query, callback);
                });
            }).then(callback || _.identity).then(function(suggestions) {
                if (callback || suggestions.length == 1) return suggestions;
                var narrow = function(suggestions) {
                    if (suggestions.length <= 1)
                        return suggestions;
                    var filtered = _.filter(suggestions, function(suggestion){
                        return suggestion.label == query || suggestion.iri == query;
                    });
                    if (filtered.length) {
                        return filtered;
                    } else {
                        return suggestions;
                    }
                };
                var filtered = narrow(suggestions);
                if (filtered.length == 1) return filtered;
                // load (possibly new) options
                bloodhound = bloodhound.then(function(bloodhound){
                    bloodhound.clear();
                    bloodhound.clearPrefetchCache();
                    bloodhound.clearRemoteCache();
                }).then(function(){
                    return new Promise(options);
                }).then(createBloodhound).then(function(newbloodhound){
                    newbloodhound.initialize();
                    return newbloodhound;
                });
                return bloodhound.then(function(bloodhound){
                    return new Promise(function(callback){
                        bloodhound.get(query, function(suggestions){
                            callback(narrow(suggestions));
                        });
                    });
                });
            });
        };
    }

    function createBloodhound(options){
        return new Bloodhound(_.extend({
            datumTokenizer: function(d) {
                return _.flatten(_.map(_.filter(_.values(d), _.isString), Bloodhound.tokenizers.whitespace));
            },
            queryTokenizer: Bloodhound.tokenizers.whitespace
        }, options));
    }

    function onlyOne(term) {
        return function(array) {
            if (array.length == 1)
                return array[0];
            if (array.length)
                throw Error("Too many values: " + array);
            throw Error("Missing " + JSON.stringify(term));
        };
    }

    function pad(num) {
        return (num < 10 ? '0' : '') + num;
    }

    function parseAsOf(ymd) {
        var m = ymd.match(/(\d\d\d\d)-(\d\d)-(\d\d)/);
        if (m) {
            var date = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
            date.setDate(date.getDate() + 1);
            date.setSeconds(-1); // one second before the end of the local day
            return date;
        } else {
            throw new Error("Unknown date format: " + ymd);
        }
    }

    function postMessage(port, message) {
        return new Promise(function(resolve, reject){
            var channel = new MessageChannel();
            channel.port2.addEventListener('message', resolve, false);
            channel.port2.start();
            port().postMessage(message, [channel.port1]);
        }).then(function(event){
            if (event.data.status === undefined) {
                return event.data;
            } else if (event.data.status == 'success') {
                return event.data.result;
            } else {
                return Promise.reject(event.data);
            }
        }).catch(function(error){
            return Promise.reject(error);
        });
    }

    function createDispatchPort() {
        var port = new SharedWorker('/screener/2014/scripts/conductor.js').port;
        _.range(11).forEach(function(index){
            var name = 'mentat' + index;
            var worker = new SharedWorker('/screener/2014/scripts/mentat.js', name).port;
            port.postMessage({
                cmd: "register",
                service: 'mentat',
                name: name
            }, [worker]);
        });
        port.postMessage({
            cmd: "register",
            service: 'quote',
            name: "dtn-quote"
        }, [new SharedWorker('/screener/2014/scripts/dtn-quote.js', "dtn-quote").port]);
        return port;
    }

    function suffixScale(getScaleSuffix, number) {
        var num = parseFloat(number);
        if (num === 0.0)
            return '' + num;
        var abs = Math.abs(num);
        var sign = num == abs ? '' : '-';
        var scale = Math.floor(Math.log(abs)/Math.log(10) / 3) * 3;
        var suffix = getScaleSuffix(scale);
        var pow = Math.pow(10, Math.abs(scale));
        if (scale >= 3) return sign + (abs / pow) + suffix;
        if (scale <= -6) return sign + (abs * pow) + suffix;
        return '' + num;
    }

    function getScaleSuffix (scale) {
        var metric = {
            'sept':24,
            'sext':21,
            'quint':18,
            'quadr':15,
            'tri':12,
            'bi':9,
            'M':6,
            'k':3,
            'h':2,
            'da':1,
            '':0,
            'd':-1,
            'c':-2,
            'm':-3,
            'µ':-6,
            'n':-9,
            'p':-12,
            'f':-15,
            'a':-18,
            'z':-21,
            'y':-24
        };
        var idx = _.indexOf(_.values(metric), scale);
        if (idx >= 0) {
            return _.keys(metric)[idx];
        } else {
            return 'e' + scale;
        }
    }

    function synchronized(func) {
        var promise = Promise.resolve();
        return function(/* arguments */) {
            var context = this;
            var args = arguments;
            return promise = promise.catch(function() {
                // ignore previous error
            }).then(function() {
                return func.apply(context, args);
            });
        };
    }

})(jQuery);
