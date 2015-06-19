// security-class.js
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

jQuery(function($){
    (function(populate_list){
        $('#categories').selectize();
        $('#exchange').change(function(event){
            screener.listSectors(event.target.value).then(function(result){
                var values = $('[property="screener:includeSector"]').toArray().map(function(span){
                    return span.getAttribute("content");
                }).concat($('#sectors input:checked').toArray().map(function(input){
                    return input.value;
                }));
                if (result.length) {
                    $('.sectors-present').show();
                } else {
                    $('.sectors-present ').hide();
                }
                $('#sectors').empty().append($(result.map(function(sector){
                    return $('<div></div>', {
                        "class": "checkbox"
                    }).append($('<label></label>').append($('<input/>', {
                        type: "checkbox",
                        value: sector,
                        checked: values.indexOf(sector) >= 0 ? "checked" : undefined
                    })).append(document.createTextNode(sector)))[0];
                })).change(whenEnabled(_.debounce(function(event){
                    var values = $('#sectors input:checked').toArray().map(function(input){
                        return input.value;
                    });
                    $('#sector-span').empty().append(values.map(function(value){
                        return $('<span></span>', {
                            property: "screener:includeSector",
                            content: value
                        });
                    }));
                    if (values.length) $('#sector-security-list-empty').hide();
                    else $('#sector-security-list-empty').show();
                    populate_list();
                }, 1000))));
            }).catch(calli.error);
        }).change();

        var mincap = $('[property="screener:mincap"]').attr("content");
        if (mincap && parseInt(mincap,10) > 1000000) {
            $('#marketcap-min').val(Math.log(mincap / 1000000) * 100);
        }
        var maxcap = $('[property="screener:maxcap"]').attr("content");
        if (maxcap && parseInt(maxcap,10) > 1000000) {
            $('#marketcap-max').val(Math.log(maxcap / 1000000) * 100);
        }
        $('#marketcap-min').add('#marketcap-max').change(function(event){
            var M = 1000000;
            var range = _.sortBy([parseInt($('#marketcap-min').val(),10), parseInt($('#marketcap-max').val(),10)], null);
            var a = range[0];
            var b = range[1] > range[0] ? range[1] : 1381;
            var min = screener.pceil(a < 1 ? 0 : Math.exp(range[0] / 100) * 1000000, 2);
            var max = screener.pceil(Math.exp(b / 100) * 1000000, 2);
            var group = $(event.target).closest('.form-group');
            group.find('[property="screener:mincap"]').remove();
            group.find('[property="screener:maxcap"]').remove();
            if ($('#marketcap-min').attr("min") != a) {
                group.append($('<span></span>', {
                    property: "screener:mincap",
                    datatype: "xsd:integer",
                    content: min
                }));
            }
            if ($('#marketcap-max').attr("max") != b) {
                group.append($('<span></span>', {
                    property: "screener:maxcap",
                    datatype: "xsd:integer",
                    content: max
                }));
            }
            var from = (function(min){
                if (min === 0)
                    return 'Nano-cap';
                if (min == 50*M)
                    return 'Micro-cap';
                if (min == 250*M)
                    return 'Small-cap';
                if (min == 2000*M)
                    return 'Mid-cap';
                if (min == 10000*M)
                    return 'Large-cap';
                if (min == 200000*M)
                    return 'Mega-cap';
                return screener.formatNumber(min);
            })(min);
            var to = (function(max){
                if (max == 50*M)
                    return 'Nano-cap';
                if (max == 250*M)
                    return 'Micro-cap';
                if (max == 2000*M)
                    return 'Small-cap';
                if (max == 10000*M)
                    return 'Mid-cap';
                if (max === 200000*M)
                    return 'Large-cap';
                if (max >= 1000000*M)
                    return 'Mega-cap';
                return screener.formatNumber(max);
            })(max);
            var text = (function(from, to){
                if (from == to)
                    return from;
                return from + ' - ' + to;
            })(from, to);
            $(event.target).closest('.form-group').find('.help-block').text(text);
            populate_list();
        }).change();

        $("#include-tickers").val(_.map($('[rel="screener:include"]').find("[resource]").toArray(), function(elem){
            var exchange = $('[rel="screener:ofExchange"][resource]').attr('resource');
            var security = elem.getAttribute("resource");
            if (security.indexOf(exchange) === 0) {
                return security.substring(exchange.length + 1);
            } else {
                return security;
            }
        }).join(' '));
        $("#exclude-tickers").val(_.map($('[rel="screener:exclude"]').find("[resource]").toArray(), function(elem){
            var exchange = $('[rel="screener:ofExchange"][resource]').attr('resource');
            var security = elem.getAttribute("resource");
            if (security.indexOf(exchange) === 0) {
                return security.substring(exchange.length + 1);
            } else {
                return security;
            }
        }).join(' '));
        var createTicker = function(exchangeId, id, single) {
            return {
                delimiter: single ? undefined : ' ',
                maxItems: single ? 1 : 10000,
                persist: false,
                searchField: ["text", "value"],
                load: function(query, callback) {
                    var exchange = $(exchangeId).val();
                    if (!query) callback();
                    else Promise.all(query.split(/\s+/).map(function(symbol){
                        return screener.lookup(symbol, exchange).then(function(securities){
                            return securities.map(function(security){
                                return {
                                    text: security.name,
                                    value: security.ticker,
                                    type: security.type
                                };
                            });
                        });
                    })).then(_.flatten).then(_.comact).then(callback, function(error){
                        callback();
                        calli.error(error);
                    });
                },
                create: single ? false : function(input, callback) {
                    var exchange = $(exchangeId).val();
                    if (!input) callback();
                    else Promise.all(input.split(/\s+/).map(function(input){
                        return screener.lookup(input, exchange).then(function(securities){
                            return securities.reduce(function(data, security){
                                if (security.ticker == input) return {
                                    text: security.name,
                                    value: security.ticker,
                                    type: security.type
                                };
                                else return data;
                            }, undefined);
                        });
                    })).then(_.compact).then(function(results){
                        if (!results) callback();
                        else if (results.length == 1) callback(results[0]);
                        else {
                            callback();
                            _.defer(function(){
                                results.forEach(function(result){
                                    $(id)[0].selectize.addItem(result.value);
                                });
                            });
                        }
                    }, function(error){
                        callback();
                        calli.error(error);
                    });
                },
                render: {
                    option: function(data, escape) {
                        return '<div style="white-space:nowrap;text-overflow:ellipsis;" title="' +
                            escape(data.text) + '"><b>' + escape(data.value) + "</b> | " +
                            escape(data.text) + ' <small>(' + escape(data.type) + ')</small></div>';
                    },
                    item: function(data, escape) {
                        return '<div class="" title="' + escape(data.text) + '">' + escape(data.value) + '</div>';
                    },
                    option_create: function(data, escape) {
                        return '<div></div>';
                    }
                }
            };
        };
        $('#include-tickers').change(whenEnabled(function(event){
            if (event.target.value) {
                appendSecurities($('[rel="screener:include"]'), event.target.value.split(/[\s,]+/));
            } else {
                $('[rel="screener:include"]').empty();
            }
            populate_list();
        })).selectize(createTicker('#exchange', '#include-tickers'));
        $('#exclude-tickers').change(whenEnabled(function(event){
            if (event.target.value) {
                appendSecurities($('[rel="screener:exclude"]'), event.target.value.split(/[\s,]+/));
            } else {
                $('[rel="screener:exclude"]').empty();
            }
            populate_list();
        })).selectize(createTicker('#exchange', '#exclude-tickers'));
        var correlated = $('[rel="screener:correlated"]').attr("resource") || '';
        $('#correlated-exchange').val(correlated.replace(/\/[^\/]+$/, '')).change(function(event){
            $('#correlated-ticker').change();
        });
        $('#correlated-ticker').val(correlated.replace(/^.*\//, '')).change(function(event){
            $('[rel="screener:correlated"]').remove();
            var exchange = $('#correlated-exchange').val();
            var ticker = $(event.target).val();
            if (ticker && exchange) {
                $(event.target).parent().append($('<div></div>', {
                    rel: "screener:correlated",
                    resource: exchange + "/" + ticker
                }));
            }
        }).selectize(createTicker('#correlated-exchange' ,'#correlated-ticker', true));
        populate_list();
        $('#security-table thead th').click(function(event){
            sortTable($(event.target).prevAll().length);
        }).css("cursor", "pointer");
    })(screener.debouncePromise(populate_list.bind(this, $('#security-table thead th.month').toArray().map(function(th){
        return $(th).text();
    })), 100));

    var lastSortedColumn;
    function sortTable(column) {
        if (column == undefined && lastSortedColumn == undefined) {
            return;
        } else if (column == undefined) {
            return sortTable(lastSortedColumn);
        } else {
            lastSortedColumn = column;
        }
        var tbody = $('#security-table tbody');
        tbody.append(tbody.children('tr').toArray().sort(function(a,b){
            var ca = $(a).children()[column];
            var cb = $(b).children()[column];
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
    }

    function populate_list(labels){
        if ($('#security-table').is(":hover")) return;
        var exchange = $('[rel="screener:ofExchange"][resource]').attr('resource');
        var sectors = $('[property="screener:includeSector"]').toArray().map(function(span){
            return span.getAttribute("content");
        });
        var mincap = $('[property="screener:mincap"]').attr("content");
        var maxcap = $('[property="screener:maxcap"]').attr("content");
        return Promise.resolve(sectors).then(function(sectors){
            if (sectors.length) {
                $('#security-table').show();
                return screener.listSecurities(exchange, sectors, mincap, maxcap);
            }
            $('#security-table tbody').empty();
            if ($('[rel="screener:include"]').children().length) $('#security-table').show();
            else $('#security-table').hide();
        }).then(function(result){
            var includes = $('[rel="screener:include"]').find("[resource]").toArray().map(function(incl){
                return incl.getAttribute('resource');
            });
            if (!result) return includes.sort();
            var excludes = $('[rel="screener:exclude"]').find("[resource]").toArray().map(function(excl){
                return excl.getAttribute('resource');
            });
            return includes.concat(_.reject(result, _.contains.bind(this, excludes))).sort();
        }).then(function(securities){
            var rows = securities.map(function(security){
                var ticker = security.substring(exchange.length + 1);
                return $('<tr></tr>').append($('<td></td>').append($('<a></a>', {
                    href: security,
                    target: $('#security-table').closest('form').length ? "_blank" : "_self"
                }).text(ticker)));
            });
            $('#security-table tbody').empty().append(rows);
            var upper = new Date();
            var lower = new Date();
            lower.setFullYear(lower.getFullYear() - 1);
            var months = _.range(12, -1, -1).map(function(m){
                return new Date(upper.getFullYear(), upper.getMonth() - m, 1);
            });
            $('#security-table thead th.month').toArray().forEach(function(th, i){
                return $(th).text(labels[months[i].getMonth()] + " " + months[i].getFullYear());
            });
            return Promise.all(securities.map(function(security, i){
                var tr = rows[i];
                var ticker = security.substring(exchange.length + 1);
                return screener.lookup(ticker, exchange).then(function(results){
                    var th = $('<td></td>').text(results.length && results[0].name || '');
                    if ($('#security-table').closest('form').length) {
                        th.append($('<a></a>',{
                            "class": "glyphicon glyphicon-remove text-danger",
                            "style": "text-decoration:none"
                        }).click(function(event){
                            if ($('#include-tickers')[0].selectize.items.indexOf(results[0].ticker) >= 0) {
                                $('#include-tickers')[0].selectize.removeItem(results[0].ticker);
                            } else {
                                $('#exclude-tickers')[0].selectize.addItem(results[0].ticker);
                            }
                            $(event.target).closest('tr').remove();
                        }));
                    }
                    return tr.append(th);
                }).then(function(){
                    return screener.load(security, ['asof', 'open','high','low','close'], 'd1', 2, upper);
                }).then(function(data){
                    if (!data.length) return tr;
                    var close = data[data.length-1].close;
                    var previous = data[data.length-2].close;
                    var change = Math.round(10000 * (close - previous) / previous) / 100;
                    var volume = data[data.length-1].volume;
                    return tr.append($('<td></td>', {
                        "class": "text-right",
                        "data-value": close
                    }).text(screener.formatCurrency(close))).append($('<td></td>', {
                        "class": change < 0 ? "text-right text-danger" : "text-right",
                        "data-value": change
                    }).text(change + '%')).append($('<td></td>', {
                        "class": "text-right",
                        "data-value": volume
                    }).text(screener.formatNumber(volume)));
                }).then(function(){
                    return screener.load(security, ['asof', 'open','high','low','close'], 'd5', 5, lower, upper);
                }).then(function(data){
                    if (!data.length) return tr;
                    var returns = months.map(function(month){
                        var range = _.filter(data, function(datum){
                            var asof = new Date(datum.asof);
                            return month.getMonth() == asof.getMonth() && month.getFullYear() == asof.getFullYear();
                        });
                        if (!range.length) return 0;
                        var open = range[0].open;
                        var close = range[range.length-1].close;
                        return 100 * (close - open) / open;
                    });
                    var close = data[data.length-1].close;
                    var y = _.sortedIndex(data, {asof: lower.toISOString()}, 'asof');
                    var total = y < data.length ? 100 * (close - data[y].open) / data[y].open : 0;
                    var high = _.max(_.pluck(data, 'high'));
                    var low = _.min(_.pluck(data, 'low'));
                    tr.append($('<td></td>', {
                        "class": "text-right",
                        "data-value": high
                    }).text(screener.formatCurrency(high))).append($('<td></td>', {
                        "class": "text-right",
                        "data-value": low
                    }).text(screener.formatCurrency(low)));
                    var sorted = returns.slice().sort(function(a,b){
                        return a - b;
                    });
                    tr.append(returns.map(function(column,i){
                        var danger = column <= Math.trunc(sorted[0]) && column < 0;
                        var success = column >= Math.trunc(sorted[sorted.length-1]) && column > 0;
                        return $('<td></td>', {
                            "class": danger ? "text-right text-danger" : success ? "text-right text-success" : "text-right",
                            "data-value": column
                        }).text(column.toFixed(2));
                    }));
                    return tr.append($('<td></td>', {
                        "class": total < 0 ? "text-right text-danger" : "text-right",
                        "data-value": total
                    }).text(total.toFixed(2) + '%'))
                }).catch(console.log.bind(console));
            }));
        }).then(function(){
            sortTable();
        }).catch(calli.error);
    }

    function whenEnabled(func) {
        return function() {
            if (!$(this).is(":disabled")) {
                func.apply(this, arguments);
            }
        };
    }

    function appendSecurities(container, list) {
        var exchange = $('[rel="screener:ofExchange"][resource').attr('resource');
        container.empty().append(_.map(_.compact(list).sort(), function(ticker){
            return $('<li></li>', {
                resource: exchange + '/' + encodeURI(ticker)
            }).text(ticker);
        }));
    }
});
