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

    var comparision = $('#security-class-form').attr("resource") && calli.copyResourceData('#security-class-form');
    $('#security-class-form').submit(function(event){
        event.preventDefault();
        var creating = event.target.getAttribute("enctype") == "text/turtle";
        var slug = calli.slugify($('#label').val());
        var ns = calli.getFormAction(event.target).replace(/\?.*/,'').replace(/\/?$/, '/');
        var resource = creating ? ns + slug : $(event.target).attr('resource');
        if (creating) {
            event.target.setAttribute("resource", resource);
            calli.postTurtle(calli.getFormAction(event.target), calli.copyResourceData(event.target)).then(function(redirect){
                screener.setItem("security-class", screener.getItem("security-class",'').split(' ').concat(redirect).join(' '));
                window.location.replace(redirect);
            }).catch(calli.error);
        } else {
            calli.submitUpdate(comparision, event);
        }
    });
    var initialLabel = $('#label').val();
    $('#saveas-security-class').click(function(event){
        event.preventDefault();
        if (initialLabel == $('#label').val()) {
            $('#label').closest('.form-group').addClass("has-error");
            return;
        }
        var form = $(event.target).closest('form')[0];
        var slug = calli.slugify($('#label').val());
        var type = $('#SecurityClass').attr('href');
        var container = $('#container-resource').attr('resource');
        var resource = container.replace(/\/?$/, '/') + slug;
        form.setAttribute("resource", resource);
        return calli.postTurtle(container + "?create=" + encodeURIComponent(type), calli.copyResourceData(form)).then(function(redirect){
            window.location.replace(redirect);
        }).catch(calli.error).then(function(){
            $('#label').closest('.form-group').removeClass("has-error");
        });
    });

    (function(populate_list){
        if (window.location.hash.length > 1) {
            $('#label').val(decodeURIComponent(window.location.hash.substring(1)));
        }
        $('#label-dialog').modal({
            show: false,
            backdrop: false
        }).on('shown.bs.modal', function () {
            $('#label').focus();
        });
        $('#store').click(function(event){
            $('#label-dialog').modal('show');
        });
        $('#categories').selectize().change();
        var removeSelectizeOption = function(id, fn) {
            var selectize = document.getElementById(id).selectize;
            selectize && _.keys(selectize.options).filter(fn).forEach(function(option){
                selectize.removeOption(option);
            });
        };
        var populateSelectize = function(id) {
            return function(result){
                var selectize = document.getElementById(id).selectize;
                selectize.addOption(result.map(function(industry){
                    return {
                        value: industry,
                        text: industry
                    };
                }));
                removeSelectizeOption(id, function(option){
                    return result.indexOf(option) < 0;
                });
                $(document.getElementById(id)).change();
            };
        };
        $('#countries').selectize().change(populate_list).change();
        $('#industries').selectize().change(populate_list).change();
        $('#sectors').selectize().change(function(event){
            screener.listIndustries($('#exchange').val(), $(event.target).val()).then(populateSelectize('industries')).catch(calli.error);
        }).change(function(event){
            screener.listCountries($('#exchange').val(), $(event.target).val()).then(populateSelectize('countries')).catch(calli.error);
        }).change(populate_list).change();
        $('#exchange').change(function(event){
            removeSelectizeOption('exclude-securities', function(option){
                return option.indexOf(event.target.value) !== 0;
            });
            screener.listSectors(event.target.value).then(function(result){
                if (result.length) {
                    $('.sectors-present').show();
                } else {
                    $('.sectors-present ').hide();
                }
                return result;
            }).then(populateSelectize('sectors')).catch(calli.error);
        }).change(populate_list).selectize().change();

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

        var createTicker = function(id, exchangeId, multiple) {
            return Promise.resolve(_.isEmpty($(id).val()) ? [] : _.flatten([$(id).val()])).then(function(securities){
                return Promise.all(securities.map(screener.getSecurity));
            }).then(function(securities){
                return {
                    maxItems: multiple ? 10000 : 1,
                    persist: false,
                    searchField: ["text", "title"],
                    options: securities.map(function(security){
                        return {
                            text: security.ticker,
                            value: security.iri,
                            title: security.name,
                            mic: security.exchange.mic
                        };
                    }),
                    items: _.pluck(securities, 'iri'),
                    load: function(query, callback) {
                        var exchange = exchangeId && $(exchangeId).val();
                        if (!query) callback();
                        else Promise.all(query.split(/\s+/).map(function(symbol){
                            return screener.lookup(symbol, exchange).then(function(securities){
                                return securities.map(function(security){
                                    return {
                                        text: security.ticker,
                                        value: security.iri,
                                        title: security.name,
                                        mic: security.exchange.mic
                                    };
                                });
                            });
                        })).then(_.flatten).then(_.comact).then(callback, function(error){
                            callback();
                            calli.error(error);
                        });
                    },
                    render: {
                        option: function(data, escape) {
                            return '<div style="white-space:nowrap;text-overflow:ellipsis;" title="' +  escape(data.title || '') + '">' +
                                (data.title ?
                                    (
                                        '<b>' + escape(data.text) + "</b> | " + escape(data.title) +
                                        ' <small class="text-muted">(' + escape(data.mic) + ')</small>'
                                    ) :
                                   escape(data.text)
                                ) +
                            '</div>';
                        },
                        item: function(data, escape) {
                            var target = $('#security-class-form').closest('form').length ? "_blank" : "_self";
                            return '<div class="" title="' + escape(data.title || '') +
                                '"><a href="' + escape(data.value) + '" target="' + target + '">' + escape(data.text) + '</a></div>';
                        }
                    }
                };
            }).then(function(options){
                $(id).selectize(options).change();
            });
        };
        createTicker($('#exclude-securities').change(populate_list), '#exchange', true);
        createTicker($('#include-securities').change(populate_list), null, true);
        createTicker('#correlated');
        $('#show-security-table').click(function(event){
            $('#security-table').parent().collapse('toggle');
            populate_list();
        });
        $('#security-table').parent().on('show.bs.collapse', function(){
            $('#show-security-table').children('.glyphicon').removeClass('glyphicon-expand').addClass('glyphicon-collapse-down');
        }).on('hidden.bs.collapse', function(){
            $('#show-security-table').children('.glyphicon').removeClass('glyphicon-collapse-down').addClass('glyphicon-expand');
        });
        populate_list();
    })(screener.debouncePromise(populate_list.bind(this, $('#security-table thead th.month').toArray().map(function(th){
        return $(th).text();
    })), 500));

    function populate_list(labels){
        if ($('#security-table').is(":hover")) return;
        var exchange = $('[rel="screener:ofExchange"][resource]').attr('resource');
        var sectors = $('[property="screener:includeSector"]').toArray().map(function(option){
            return option.getAttribute("value");
        });
        if (!exchange) return;
        var mincap = $('[property="screener:mincap"]').attr("content");
        var maxcap = $('[property="screener:maxcap"]').attr("content");
        $('#security-table').addClass("loading");
        return Promise.resolve(sectors).then(function(sectors){
            if (!_.isEmpty(sectors)) {
                $('#security-table').show();
                var industries = $('[property="screener:includeIndustry"]').toArray().map(function(option){
                    return option.getAttribute("value");
                });
                var countries = $('[property="screener:includeCountry"]').toArray().map(function(option){
                    return option.getAttribute("value");
                });
                return screener.listSecurities(exchange, sectors, industries, countries, mincap, maxcap);
            }
            $('#security-table tbody').empty();
            if ($('[rel="screener:include"][resource]').length) $('#security-table').show();
            else $('#security-table').hide();
        }).then(function(result){
            var includes = $('[rel="screener:include"][resource]').toArray().map(function(incl){
                return incl.getAttribute('resource');
            });
            if (!result) return includes.sort();
            var excludes = $('[rel="screener:exclude"][resource]').toArray().map(function(excl){
                return excl.getAttribute('resource');
            });
            return includes.concat(_.reject(result, _.contains.bind(this, excludes))).sort();
        }).then(function(securities){
            $('#security-count').text(securities.length);
            if ($('#security-table').is(":hidden")) return;
            var target = $('#security-table').closest('form').length ? "_blank" : "_self";
            var rows = securities.map(function(security){
                // ticker
                var ticker = security.replace(/^.*\//,'');
                var th = $('<th></th>').append($('<a></a>', {
                    href: security,
                    target: target
                }).text(ticker));
                if ($('#security-table').closest('form').length) {
                    th.append($('<a></a>',{
                        "class": "glyphicon glyphicon-remove text-danger pull-right",
                        "style": "text-decoration:none"
                    }).click(function(event){
                        if (_.contains($('#include-securities').val(), security)) {
                            $('#include-securities')[0].selectize.removeItem(security);
                        } else {
                            $('#exclude-securities')[0].selectize.addOption({
                                text: ticker,
                                value: security,
                                title: ticker,
                                type: ''
                            });
                            $('#exclude-securities')[0].selectize.addItem(security);
                        }
                        $(event.target).closest('tr').remove();
                    }));
                }
                return $('<tr></tr>').append(th);
            });
            $('#security-table tbody').empty().append(rows);
            $('#security-table').removeClass("loading");
            var monthHeaders = $('#security-table thead th.month').toArray();
            var upper = new Date();
            var lower = new Date();
            lower.setFullYear(lower.getFullYear() - 1);
            var months = _.range(12, 12-monthHeaders.length, -1).map(function(m){
                return new Date(upper.getFullYear(), upper.getMonth() - m, 1);
            });
            var classes = $('#security-table thead th').toArray().map(function(th){
                return "text-right " + th.className;
            });
            var hidden = $('#security-table thead th').toArray().map(function(th){
                return $(th).is(":hidden");
            });
            monthHeaders.forEach(function(th, i){
                return $(th).text(labels[months[i].getMonth()] + " " + months[i].getFullYear());
            });
            return Promise.all(securities.map(function(security, i){
                var tr = rows[i];
                var day = hidden[2] || screener.load(security, ['asof', 'open','high','low','close'], 'day', 2, upper);
                // name
                var ticker = security.replace(/^.*\//,'');
                return screener.getSecurity(security).then(function(result){
                    var th = $('<td></td>').text(result && result.name || '');
                    return tr.append(th);
                }).then(function(){
                    // close change volume
                    if (day) return day;
                    else return [];
                }).then(function(data){
                    if (!data.length) return tr;
                    var close = data[data.length-1].close;
                    var previous = data.length > 1 ? data[data.length-2].close : close;
                    var change = Math.round(10000 * (close - previous) / previous) / 100;
                    var volume = data[data.length-1].volume;
                    return tr.append($('<td></td>', {
                        "class": classes[tr.children().length],
                        "data-value": close
                    }).text(screener.formatCurrency(close))).append($('<td></td>', {
                        "class": (change < 0 ? "text-danger " : '') + classes[tr.children().length],
                        "data-value": change
                    }).text(data.length > 1 && (change + '%') || '')).append($('<td></td>', {
                        "class": classes[tr.children().length],
                        "data-value": volume
                    }).text(screener.formatNumber(volume)));
                }).then(function(){
                    // high low
                    if (hidden[5]) return [];
                    return screener.load(security, ['asof', 'open','high','low','close'], 'month', 1, lower, upper);
                }).then(function(data){
                    if (!data.length) return data;
                    var high = _.max(_.pluck(data, 'high'));
                    var low = _.min(_.pluck(data, 'low'));
                    tr.append($('<td></td>', {
                        "class": classes[tr.children().length],
                        "data-value": high
                    }).text(screener.formatCurrency(high))).append($('<td></td>', {
                        "class": classes[tr.children().length],
                        "data-value": low
                    }).text(screener.formatCurrency(low)));
                    return data;
                }).then(function(data){
                    if (!data.length) return data;
                    var close = data[data.length-1].close;
                    var returns = months.map(function(month){
                        var range = _.filter(data, function(datum){
                            var asof = new Date(datum.asof);
                            asof.setDate(asof.getDate() - 1);
                            return month.getMonth() == asof.getMonth() && month.getFullYear() == asof.getFullYear();
                        });
                        if (!range.length) return 0;
                        var open = range[0].open;
                        var close = range[range.length-1].close;
                        return 100 * (close - open) / open;
                    });
                    var sorted = returns.slice().sort(function(a,b){
                        return a - b;
                    });
                    tr.append(returns.map(function(column,i){
                        var danger = column <= Math.trunc(sorted[0]) && column < 0;
                        var success = column >= Math.trunc(sorted[sorted.length-1]) && column > 0;
                        var cls = danger ? "text-danger " : success ? "text-success " : '';
                        return $('<td></td>', {
                            "class": cls + classes[tr.children().length],
                            "data-value": column
                        }).text(column.toFixed(2));
                    }));
                    return data;
                }).then(function(data){
                    if (!data.length) return data;
                    var close = data[data.length-1].close;
                    var total = 100 * (close - data[0].open) / data[0].open;
                    return tr.append($('<td></td>', {
                        "class": (total < 0 ? "text-danger " : '') + classes[tr.children().length],
                        "data-value": total
                    }).text(total.toFixed(2) + '%'))
                }).catch(console.log.bind(console));
            }));
        }).then(function(){
            screener.sortTable('#security-table');
        }).catch(calli.error).then(function(){
            $('#security-table').removeClass("loading");
        });
    }
});
