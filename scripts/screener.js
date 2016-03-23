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

            getProfile: function(){
                return postDispatchMessage({
                    cmd: 'profile'
                }).then(function(iri){
                    if (_.isString(iri)) return iri;
                    else return undefined; // no profile
                });
            },

            setProfile: function(profile){
                return postDispatchMessage({
                    cmd: 'profile',
                    launch: profile
                });
            },

            debouncePromise: function(func, wait, promise) {
                var end = Promise.resolve(promise);
                return function(/* arguments */) {
                    var context = this;
                    var args = arguments;
                    var current = end = end.catch(function() {
                        // ignore previous error
                    }).then(function(){
                        if (current === end) return new Promise(function(resolve){
                            _.delay(resolve, wait || 0); // wait for another call
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

            formatCurrency: function(number) {
                return '$' + number.toFixed(2);
            },

            sortTable: (function(sortedTables, sortedByColumnNumber, table, columnNumber) {
                if (sortedTables.indexOf(table) < 0) {
                    sortedTables.push(table);
                }
                $(table).children('thead').find('th').filter(function(){
                    return $(this).css("cursor") != "pointer";
                }).click(function(event){
                    var th = $(event.target).closest('th');
                    screener.sortTable(table, th.prevAll().toArray().reduce(function(cols, col){
                        return +(col.getAttribute("colspan") || 1) + cols;
                    }, +(th.attr("colspan") || 1) - 1));
                }).css("cursor", "pointer");
                var lastSortedColumn = sortedByColumnNumber[sortedTables.indexOf(table)];
                if (columnNumber === undefined && lastSortedColumn === undefined) {
                    return;
                } else if (columnNumber === undefined) {
                    return screener.sortTable(table, lastSortedColumn);
                } else {
                    sortedByColumnNumber[sortedTables.indexOf(table)] = columnNumber;
                }
                var tbody = $(table).children('tbody');
                tbody.append(tbody.children('tr').toArray().sort(function(a,b){
                    var ca = $(a).children()[columnNumber];
                    var cb = $(b).children()[columnNumber];
                    if (!ca && !cb) {
                        ca = $(a).children()[0];
                        cb = $(b).children()[0];
                    }
                    if (!ca) return 1;
                    if (!cb) return -1;
                    var va = ca.getAttribute("data-value");
                    var vb = cb.getAttribute("data-value");
                    var ta = $(ca).text();
                    var tb = $(cb).text();
                    if (va || vb) return +vb - +va;
                    else if (ta < tb) return -1;
                    else if (ta > tb) return 1;
                    else return 0;
                }));
            }).bind(this, [], []),

            ping: function() {
                return postDispatchMessage("ping");
            },

            validate: function(expression, interval) {
                var int = interval && interval.indexOf('/') ? interval.substring(interval.lastIndexOf('/') + 1) : interval;
                return postDispatchMessage({
                    cmd: 'validate',
                    expression: expression,
                    interval: {value: int}
                });
            },

            listExchanges: _.memoize(function(){
                return calli.getJSON($('#queries').prop('href') + 'exchange-list.rq?tqx=out:table').then(tableToObjectArray);
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

            listIndustries: function(exchange, sectors) {
                if (!exchange || _.isEmpty(sectors)) return Promise.resolve([]);
                return getExchange(exchange).then(function(exchange){
                    return Promise.all((_.isString(sectors) ? [sectors] : sectors).map(function(sector){
                        return postDispatchMessage({
                            cmd: 'industry-list',
                            exchange: exchange,
                            sector: sector
                        });
                    })).then(_.flatten);
                });
            },

            listCountries: function(exchange, sectors) {
                if (!exchange || _.isEmpty(sectors)) return Promise.resolve([]);
                return getExchange(exchange).then(function(exchange){
                    return Promise.all((_.isString(sectors) ? [sectors] : sectors).map(function(sector){
                        return postDispatchMessage({
                            cmd: 'country-list',
                            exchange: exchange,
                            sector: sector
                        });
                    })).then(_.flatten);
                });
            },

            listSecurities: function(exchange, sectors, industries, countries, mincap, maxcap) {
                return getExchange(exchange).then(function(exchange){
                    return Promise.all((_.isString(sectors) ? [sectors] : sectors).map(function(sector){
                        return postDispatchMessage({
                            cmd: 'security-list',
                            exchange: exchange,
                            sector: sector,
                            industries: industries,
                            countries: countries,
                            mincap: mincap,
                            maxcap: maxcap
                        });
                    })).then(_.flatten);
                });
            },

            getUserProfile: function(){
                return calli.getCurrentUserAccount().then(function(iri){
                    var url = "user-profile.rq?tqx=out:table&user=" + encodeURIComponent(iri);
                    return calli.getJSON($('#queries').prop('href') + url);
                }).then(tableToObjectArray).then(function(results){
                    if (results.length) return results[0].profile;
                    else throw Error("No profile existis for current user");
                });
            },

            listUnits: _.memoize(function(){
                var url = $('#queries').prop('href') + 'unit-list.rq?tqx=out:table';
                return calli.getJSON(url).then(tableToObjectArray);
            }),

            listIntervals: _.memoize(function(){
                var url = $('#queries').prop('href') + 'interval-list.rq?tqx=out:table';
                return calli.getJSON(url).then(tableToObjectArray).then(function(list){
                    return postDispatchMessage("indicator-list").then(function(indicators){
                        return list.filter(function(item){
                            return indicators.indexOf(item.value) >= 0;
                        });
                    });
                });
            }),

            listIndicators: _.memoize(function(){
                var url = $('#queries').prop('href') + 'indicator-list.rq?tqx=out:table';
                return calli.getJSON(url).then(tableToObjectArray).then(function(list){
                    return Promise.all(list.map(inlineIndicator));
                }).then(function(list){
                    return _.filter(list, 'interval');
                }).then(function(list){
                    var validate = _.memoize(function(interval) {
                        return postDispatchMessage({
                            cmd: 'validate',
                            interval: interval
                        });
                    });
                    return Promise.all(list.map(function(indicator){
                        return validate(indicator.interval).then(_.constant(indicator), function(){});
                    }));
                }).then(_.compact);
            }),

            getIndicator: _.memoize(function(iri) {
                return screener.listIndicators().then(function(indicators){
                    return _.find(indicators, function(indicator){
                        return indicator.iri == iri;
                    });
                });
            }),

            inlineFilters: function(filters) {
                if (_.isEmpty(filters)) return Promise.resolve([]);
                return Promise.all(filters.map(function(filter){
                    return inlineCriteria(filter);
                }));
            },

            listSecurityClasses: _.throttle(function(){
                return calli.getCurrentUserAccount().then(function(iri){
                    var url = "security-class.rq?tqx=out:table&user=" + encodeURIComponent(iri);
                    return calli.getJSON($('#queries').prop('href') + url);
                }).then(tableToObjectArray).then(function(list){
                    return Promise.all(list.map(inlineSecurityClass));
                });
            }, 1000),

            listScreens: _.throttle(function() {
                return calli.getCurrentUserAccount().then(function(iri){
                    var url = "screen-list.rq?tqx=out:table&user=" + encodeURIComponent(iri);
                    return calli.getJSON($('#queries').prop('href') + url);
                }).then(tableToObjectArray).then(function(list){
                    var criteria = _.mapObject(_.groupBy(list.filter(function(item){
                        return item.criteria;
                    }), 'iri'), function(filters, iri) {
                        return filters.map(function(item){
                            return _.extend(_.omit(item, 'criteria', 'criteria_label', 'criteria_comment'), {
                                iri: item.criteria,
                                label: item.criteria_label,
                                comment: item.criteria_comment
                            });
                        });
                    });
                    var screens = _.sortBy(_.values(_.mapObject(_.groupBy(list.filter(function(item){
                        return !item.criteria;
                    }), 'iri'), function(items, iri) {
                        return _.extend.apply(_, items);
                    })).map(function(screen){
                        return _.extend(screen, {
                            criteria: _.sortBy(criteria[screen.iri], 'iri')
                        });
                    }), 'label');
                    return Promise.all(screens.map(inlineScreen));
                });
            }, 1000),

            resetSecurity: function(security){
                return getExchangeOfSecurity(security).then(function(exchange){
                    return postDispatchMessage({
                        cmd: 'reset',
                        exchange: exchange,
                        security: security
                    });
                });
            },

            now: (function(loadedAt) {
                return new Date(screener.getItem("now", loadedAt));
            }).bind(this, new Date()),

            promiseWorkday: function(start_date, days) {
                if (_.isFinite(start_date)) return screener.promiseWorkday(screener.now(), start_date);
                if (_.isDate(days)) return Promise.resolve(days);
                var w = days < 0 ? Math.ceil(days / 5) : Math.floor(days / 5);
                var d = days - w * 5;
                var since = new Date(new Date(start_date || screener.now()).toISOString().replace(/T.*/,''));
                since.setMinutes(since.getMinutes() + since.getTimezoneOffset());
                if (days < 0 && since.getDay() === 0) {
                    since.setDate(since.getDate() - 1);
                } else if (days > 0 && since.getDay() === 7) {
                    since.setDate(since.getDate() + 1);
                }
                since.setDate(since.getDate() + w * 7 + d);
                if (since.getDay() === 0 || since.getDay() == 7) {
                    since.setDate(since.getDate() + 2 * days / Math.abs(days));
                }
                return Promise.resolve(since);
            },

            lookup: function(symbol, exchange) {
                if (!exchange && symbol.indexOf('://') > 0) {
                    exchange = symbol.replace(/\/[^\/]*$/,'');
                    symbol = decodeURIComponent(symbol.replace(/^.*\//,''));
                }
                var exchanges = exchange ?
                    Promise.all([getExchange(exchange)]) :
                    screener.listExchanges();
                return exchanges.then(function(exchanges){
                    return Promise.all(exchanges.map(function(exchange){
                        return postDispatchMessage({
                            cmd: 'lookup',
                            symbol: symbol,
                            exchange: exchange
                        }).then(function(list){
                            return list.map(function(item){
                                return _.extend(item, {
                                    exchange: exchange
                                });
                            });
                        });
                    })).then(function(results){
                        if (results.length == 1) return results[0];
                        else return _.sortBy(_.flatten(results), 'iri');
                    });
                });
            },

            getSecurity: _.memoize(function(iri){
                return getExchange(iri.replace(/\/[^\/]*$/,'')).then(function(exchange){
                    var ticker = decodeURIComponent(iri.substring(exchange.iri.length+1));
                    return postDispatchMessage({
                        cmd: 'security',
                        security: {
                            iri: iri,
                            ticker: ticker,
                            exchange: exchange
                        }
                    }).then(function(obj){
                        if (obj) return _.extend(obj, {
                            exchange: exchange
                        }); else return obj;
                    });
                });
            }),

            watch: function(security, notify) {
                var ohlc = {}, last = {}, handle;
                return (_.isObject(security) ? Promise.resolve(security) : screener.getSecurity(security)).then(function(security){
                    return postDispatchMessage({
                        cmd: 'watch',
                        security: security
                    }, function(update){
                        var price = +update.price;
                        ohlc = _.defaults({
                            open: ohlc.open || price,
                            high: Math.max(ohlc.high || price, price),
                            low: Math.min(ohlc.low || price, price),
                            close: price
                        }, update);
                        if (!handle && last.close != ohlc.close) handle = window.requestIdleCallback(function(){
                            notify(ohlc);
                            last = ohlc;
                            ohlc = {};
                            handle = null;
                        });
                    });
                }).then(function(result){
                    var price = +result.price;
                    return last = _.defaults({
                        open: price,
                        high: price,
                        low: price,
                        close: price
                    }, result);
                });
            },

            load: function(security, expressions, interval, length, lower, upper) {
                if (length < 0 || length != Math.round(length)) throw Error("length must be a non-negative integer, not " + length);
                if (!interval) throw Error("interval is required, not " + interval);
                var int = interval.indexOf('/') ? interval.substring(interval.lastIndexOf('/') + 1) : interval;
                return (_.isObject(security) ? Promise.resolve(security) : screener.getSecurity(security)).then(function(security){
                    return postDispatchMessage({
                        cmd: 'load',
                        security: security,
                        expressions: expressions,
                        interval: {value: int},
                        length: length,
                        lower: lower,
                        upper: upper || lower
                    });
                });
            },

            /*
             * securityClasses: [{ofExchange:$iri, includes:[$ticker]}]
             * criteria: [{indicator:{expression:$expression, interval: $interval}}]
             * begin: new Date() || days
             * end: new Date()
            */
            screen: function(securityClasses, criteria, begin, end) {
                var endDate = end || screener.now();
                return Promise.resolve(begin).then(function(begin){
                    if (_.isDate(begin)) return begin;
                    return screener.promiseWorkday(endDate, -begin);
                }).then(function(beginDate){
                    return inlineSecurityClasses(securityClasses).then(function(securityClasses) {
                        return Promise.all(securityClasses.map(function(securityClass){
                            return screener.inlineFilters(criteria).then(function(criteria){
                                return {
                                    cmd: 'screen',
                                    begin: beginDate,
                                    end: endDate,
                                    securityClass: securityClass,
                                    criteria: criteria
                                };
                            }).then(postDispatchMessage);
                        })).then(function(results){
                            return _.flatten(results);
                        });
                    });
                });
            },

            /*
             * securityClasses: [{ofExchange:$iri, includes:[$ticker]}]
             * criteria: [{indicator:{expression:$expression, interval: $interval}}]
             * begin: new Date() || days
             * end: new Date()
            */
            signals: function(securityClasses, criteria, begin, end) {
                var endDate = end || screener.now();
                return Promise.resolve(begin).then(function(begin){
                    if (_.isDate(begin)) return begin;
                    return screener.promiseWorkday(endDate, -begin);
                }).then(function(beginDate){
                    return inlineSecurityClasses(securityClasses).then(function(securityClasses) {
                        return Promise.all(securityClasses.map(function(securityClass){
                            return screener.inlineFilters(criteria).then(function(criteria){
                                return {
                                    cmd: 'signals',
                                    begin: beginDate,
                                    end: endDate,
                                    securityClass: securityClass,
                                    criteria: criteria
                                };
                            }).then(postDispatchMessage);
                        })).then(function(results){
                            return _.flatten(results);
                        });
                    });
                });
            }
        });
    })(_.bindAll(createDispatch(), 'promiseMessage').promiseMessage);

    function inlineScreens(screens) {
        return screener.listScreens().then(function(list){
            return Promise.all(screens.map(function(screen) {
                if (_.isObject(screen)) return screen;
                return _.find(list, function(item){
                    return item.iri == screen;
                });
            }));
        }).then(function(screens){
            return Promise.all(screens.map(inlineScreen));
        });
    }

    function inlineScreen(screen) {
        if (_.isString(screen)) return inlineScreens([screen]).then(_.first);
        return Promise.all([
            inlineSecurityClasses(split(screen.securityClasses || screen.forSecurity)),
            screener.inlineFilters(screen.criteria)
        ]).then(function(array) {
            return _.extend({}, screen, {
                securityClasses: array[0],
                criteria: array[1]
            });
        });
    }

    function getIndicator(iri) {
        if (_.isObject(iri)) return Promise.resolve(inlineIndicator(iri));
        return screener.listIndicators().then(function(list){
            return _.find(list, function(item){
                return item.iri == iri;
            });
        });
    }

    function inlineIndicator(indicator) {
        if (!indicator) return undefined;
        return screener.listUnits().then(function(units){
            return _.find(units, function(unit){
                return unit.iri == indicator.hasUnit;
            });
        }).then(function(unit){
            return screener.listIntervals().then(function(intervals){
                return _.find(intervals, function(interval){
                    return interval.iri == indicator.hasInterval;
                });
            }).then(function(interval){
                return _.extend({
                    interval: interval,
                    unit: unit
                }, indicator);
            });
        });
    }

    function inlineSecurityClasses(securityClasses) {
        if (!_.isArray(securityClasses)) return inlineSecurityClasses([securityClasses]);
        return screener.listSecurityClasses().then(function(list){
            return Promise.all(securityClasses.map(function(securityClass) {
                if (_.isObject(securityClass)) return securityClass;
                var cls = _.find(list, function(cls){
                    return cls.iri == securityClass;
                });
                if (cls) return cls;
                return screener.getSecurity(securityClass).then(function(security){
                    return inlineSecurityClass({
                        exchange: security.exchange,
                        includes: [security.iri]
                    });
                }, function(error){
                    console.warn(error);
                });
            }));
        }).then(function(securityClasses) {
            return Promise.all(_.compact(securityClasses).map(inlineSecurityClass));
        });
    }

    function inlineSecurityClass(sc) {
        if (!sc.ofExchange && !sc.exchange) throw Error("No security class exchange: " + JSON.stringify(sc));
        return getExchange(sc.exchange || sc.ofExchange).then(function(exchange){
            var prefix = function(security){
                if (!_.isString(security)) return security;
                else if (security.indexOf('://') > 0) return security;
                else return exchange.iri + '/' + encodeURI(security);
            };
            return _.omit(_.extend({}, sc, {
                exchange: exchange,
                sectors: split(sc.sectors || sc.includeSectors, '\t'),
                industries: split(sc.industries || sc.includeIndustries, '\t'),
                countries: split(sc.countries || sc.includeCountries, '\t'),
                includes: split(sc.includes).map(prefix),
                excludes: split(sc.excludes).map(prefix)
            }), function(value){
                return _.isUndefined(value) || _.isNull(value) || _.isEmpty(value) && (_.isArray(value) || _.isString(value));
            });
        }).then(function(sc){
            if (_.isEmpty(sc.includes)) return sc;
            return Promise.all(sc.includes.map(function(security){
                if (_.isString(security)) {
                    return screener.getSecurity(security).catch(function(error){
                        console.warn(error);
                    });
                } else {
                    return security;
                }
            })).then(_.compact).then(function(includes){
                return _.extend(sc, {
                    includes: includes
                });
            });
        }).then(function(sc){
            if (!_.isString(sc.correlated)) return sc;
            return screener.getSecurity(sc.correlated).then(function(correlated){
                return _.extend(sc, {
                    correlated: correlated
                });
            });
        });
    }

    function inlineCriteria(criteria) {
        return Promise.all([
                criteria.indicator || criteria.forIndicator,
                criteria.indicatorWatch || criteria.forWatchIndicator,
                criteria.difference || criteria.differenceFrom,
                criteria.differenceWatch || criteria.differenceFromWatch,
                criteria.percent || criteria.percentOf,
                criteria.percentWatch || criteria.percentOfWatch
        ].map(function(indicator){
            return getIndicator(indicator);
        })).then(function(indicators){
            return _.object([
                'indicator', 'indicatorWatch',
                'difference', 'differenceWatch',
                'percent', 'percentWatch'
            ], indicators);
        }).then(function(indicators){
            return _.extend({}, criteria, indicators);
        }).then(function(criteria){
            return _.omit(criteria, _.isNull);
        }).then(function(criteria){
            return _.omit(criteria, _.isUndefined);
        });
    }

    function split(list, by) {
        return _.isArray(list) ? list : _.compact((list || '').split(by || ' '));
    }

    function getExchange(iri) {
        if (_.isObject(iri)) return Promise.resolve(iri);
        return screener.listExchanges().then(function(exchanges){
            var exchange = _.find(exchanges, function(ex){
                return ex.iri == iri;
            });
            if (exchange) return exchange;
            else throw Error("Unknown exchange: " + iri);
        });
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

    function tableToObjectArray(table){
        return table.rows.map(function(row){
            return _.omit(_.object(table.columns, row), _.isNull);
        });
    }

    function createDispatch() {
        var url = "ws://localhost:1880/";
        try {
            url = window.localStorage.getItem("socket") || url;
        } catch (e) {
            if (console) console.error(e);
        }
        var dispatch = {
            counter: 0,
            outstanding: {}
        };
        dispatch.open = function(){
            return dispatch.openPromise = (dispatch.openPromise || Promise.reject()).catch(function(){
                var socket, buffer;
                return new Promise(function(callback){
                    socket = new WebSocket(url);
                    socket.addEventListener("close", function(event) {
                        dispatch.openPromise = null;
                        _.values(dispatch.outstanding).forEach(function(pending){
                            if (pending.socket == socket) pending.reject(event);
                        });
                    });
                    socket.addEventListener("open", callback);
                    socket.addEventListener("message", function(event) {
                        buffer = buffer ? buffer + event.data : event.data;
                        while (buffer.indexOf('\n\n') > 0) {
                            var idx = buffer.indexOf('\n\n') + 2;
                            var json = buffer.substring(0, idx);
                            buffer = buffer.substring(idx);
                            Promise.resolve(json).then(JSON.parse.bind(JSON)).then(function(data){
                                var id = data.id;
                                var pending = dispatch.outstanding[id];
                                if (id && pending) {
                                    if (!data || data.status == 'success' || data.status === undefined) {
                                        if (data && data.result) {
                                            pending.resolve(data.result);
                                        } else if (data && data.update) {
                                            pending.update(data.update);
                                        } else {
                                            pending.resolve(data);
                                        }
                                    } else if (data.status == 'warning') {
                                        console.warn(data.message);
                                        if (data && data.result) {
                                            pending.resolve(data.result);
                                        } else {
                                            pending.resolve(data);
                                        }
                                    } else {
                                        pending.reject(data);
                                    }
                                } else {
                                    console.error(data);
                                    console.log(data.id, "not one of", _.keys(dispatch.outstanding))
                                    throw Error("Unknown WebSocket message");
                                }
                            }).catch(function(error){
                                console.error(error);
                            });
                        }
                    });
                }).then(function(){
                    console.log("Connected to", url);
                    return socket;
                });
            });
        };
        dispatch.promiseMessage = throttlePromise(function(data, update) {
            return dispatch.open().then(function(socket){
                var id = ++dispatch.counter;
                return new Promise(function(resolve, reject){
                    dispatch.outstanding[id] = {
                        request: data,
                        resolve: resolve,
                        reject: reject,
                        update: update,
                        socket: socket
                    };
                    if (data && _.isObject(data)) {
                        data.id = id;
                    } else if (data) {
                        data = {cmd: data, id: id};
                    } else {
                        throw Error("Empty message: " + data);
                    }
                    socket.send(JSON.stringify(deepOmit(data, 'label', 'comment')) + '\n\n');
                }).then(function(resolved){
                    dispatch.outstanding[id].response = resolved;
                    if (!update) delete dispatch.outstanding[id];
                    return resolved;
                }, function(rejected){
                    dispatch.outstanding[id].response = rejected;
                    if (!update) delete dispatch.outstanding[id];
                    return Promise.reject(rejected);
                });
            });
        }, 64);
        return dispatch;
    }

    function throttlePromise(fn, limit) {
        var max = limit || 1;
        var currently = 0;
        var queue = [];
        var next = function(){
            if (currently < max && queue.length) {
                currently++;
                queue.shift().call();
            }
        };
        return function(/* arguments */) {
            var context = this;
            var args = arguments;
            return new Promise(function(callback){
                queue.push(callback);
                next();
            }).then(function(){
                return fn.apply(context, args);
            }).then(function(result){
                currently--;
                next();
                return result;
            }, function(error){
                currently--;
                next();
                return Promise.reject(error);
            });
        };
    }

    function deepOmit(obj, iteratee, context) {
        var args = _.toArray(arguments);
        var rest = _.rest(args);
        if (_.isEmpty(obj) || _.isFunction(obj) || _.isRegExp(obj) || obj.toJSON) {
            return obj;
        } else if (_.isArray(obj)) {
            return obj.map(function(item){
                return deepOmit.apply(this, [item].concat(rest));
            });
        } else if (_.isObject(obj)) {
            var copy = _.omit.apply(_, args);
            for (var prop in copy) {
                copy[prop] = deepOmit.apply(this, [copy[prop]].concat(rest));
            }
            return copy;
        } else {
            return obj;
        }
    }

    function suffixScale(getScaleSuffix, number) {
        var num = parseFloat(number);
        if (num === 0.0)
            return '' + num;
        var abs = Math.abs(num);
        var sign = num == abs ? '' : '-';
        var scale = Math.floor(Math.log(abs)/Math.log(10) / 3) * 3;
        var suffix = scale >= 3 || scale <= -6 ? getScaleSuffix(scale) : '';
        var pow = Math.pow(10, Math.abs(scale));
        var value = suffix ? (abs / pow) : abs;
        if (value == Math.round(value)) return sign + value + suffix;
        else return sign + value.toFixed(2) + suffix;
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

})(jQuery);
