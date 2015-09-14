// screen.js
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

    initializeCriteriaSelect();
    initializeSecurityClassSelect();
    initializeSinceInput();
    initializeResultsTable();
    initializeFormActions();
    initializeWatchList();

    function initializeCriteriaSelect() {
        screener.listCriteria().then(function(list){
            return list.map(function(criteria){
                return {
                    value: criteria.iri,
                    text: criteria.label,
                    title: criteria.comment
                };
            });
        }).then(function(options){
            $('select[name="criteria"]').toArray().forEach(function(select){
                $(select).selectize({
                    searchField: ['text', 'title'],
                    options: options,
                    render: {
                        item: function(data, escape){
                            return '<div title="' + escape(data.title || '') + '"><a href="' +
                                escape(data.value) + '?edit" onclick="calli.createResource(event)">' + escape(data.text) + '</a></div>';
                        }
                    },
                    create: function(input, callback) {
                        var cls = $('#Criteria').prop('href');
                        var container = $('#container-resource').attr('resource') || window.location.pathname;
                        var url = container + "?create=" + encodeURIComponent(cls) + "#" + encodeURIComponent(input);
                        calli.createResource(select, url).then(function(iri){
                            return screener.listCriteria().then(function(list){
                                return _.find(list, function(criteria){
                                    return criteria.iri == iri;
                                }) || {
                                    value: iri,
                                    text: input
                                };
                            });
                        }).then(function(criteria){
                            return {
                                value: criteria.iri,
                                text: criteria.label,
                                title: criteria.comment
                            };
                        }).then(callback, function(error){
                            callback();
                            call.error(error);
                        });
                    }
                }).change();
            });
        });
    }

    function initializeSecurityClassSelect() {
        screener.listSecurityClasses().then(function(classes){
            return classes.map(function(cls){
                return {
                    value: cls.iri,
                    text: cls.label
                };
            });
        }).then(function(options){
            return Promise.all(screener.getItem("security-class", '').split(' ').filter(function(iri){
                return iri && _.pluck(options, 'value').indexOf(iri) < 0;
            }).map(function(iri){
                return screener.getSecurity(iri);
            })).then(function(securities){
                return securities.map(function(security){
                    return {
                        text: security.ticker,
                        value: security.iri,
                        title: security.name,
                        type: security.type,
                        mic: security.exchange.mic
                    };
                }).concat(options);
            });
        }).then(function(options){
            $('#security-class').selectize({
                options: options,
                items: screener.getItem("security-class", '').split(' '),
                closeAfterSelect: true,
                load: function(query, callback) {
                    if (!query) callback();
                    return screener.lookup(query).then(function(securities){
                        return securities.map(function(security){
                            return {
                                text: security.ticker,
                                value: security.iri,
                                title: security.name,
                                type: security.type,
                                mic: security.exchange.mic
                            };
                        });
                    }).then(callback, function(error){
                        callback();
                        calli.error(error);
                    });
                },
                create: $('#container-resource').attr('resource') && function(input, callback) {
                    var cls = $('#SecurityClass').prop('href');
                    var container = $('#container-resource').attr('resource') || window.location.pathname;
                    var url = container + "?create=" + encodeURIComponent(cls) + "#" + encodeURIComponent(input);
                    calli.createResource('#security-class', url).then(function(iri){
                        callback({
                            value: iri,
                            text: input
                        });
                    }, function(error){
                        callback();
                        call.error(error);
                    });
                },
                render: {
                    option: function(data, escape) {
                        return '<div style="white-space:nowrap;text-overflow:ellipsis;" title="' +  escape(data.title || '') + '">' +
                            (data.title ?
                                (
                                    '<b>' + escape(data.text) + "</b> | " + escape(data.title) +
                                    ' <small class="text-muted">(' + escape(data.mic + ' ' + data.type) + ')</small>'
                                ) :
                               escape(data.text)
                            ) +
                        '</div>';
                    },
                    item: function(data, escape) {
                        var target = $('#screen-form').closest('form').length ? "_blank" : "_self";
                        return '<div class="" title="' + escape(data.title || '') +
                            '"><a href="' + escape(data.value) + '" target="' + target + '">' + escape(data.text) + '</a></div>';
                    }
                }
            }).change(function(event){
                screener.setItem("security-class", ($(event.target).val() || []).join(' '));
            }).change();
        });
    }

    function initializeSinceInput() {
        var lastWeek = new Date(new Date().toISOString().replace(/T.*/,''));
        lastWeek.setDate(lastWeek.getDate() -  screener.getItem("since-days", 20) / 5 * 7);
        $('#since').prop('valueAsDate', lastWeek).change(function(event){
            var since = event.target.valueAsDate;
            var today = new Date(new Date().toISOString().replace(/T.*/,''));
            screener.setItem("since-days", (today.valueOf() - since.valueOf()) / 1000 / 60 / 60 / 24 / 7 * 5);
        });
    }

    function initializeResultsTable() {
        $('#show-results-table').click(function(event){
            $('#results-table').parent().collapse('toggle');
        });
        $('#results-table').parent().on('show.bs.collapse', function(){
            $('#show-results-table').children('.glyphicon').removeClass('glyphicon-expand').addClass('glyphicon-collapse-down');
        }).on('hidden.bs.collapse', function(){
            $('#show-results-table').children('.glyphicon').removeClass('glyphicon-collapse-down').addClass('glyphicon-expand');
        });
    }

    function initializeFormActions() {
        $('#label-dialog').modal({
            show: false,
            backdrop: false
        }).on('shown.bs.modal', function () {
            $('#label').focus();
        });
        $('#store').click(function(event){
            $('#label-dialog').modal('show');
        });
        var comparision = $('#screen-form').attr("resource") && calli.copyResourceData('#screen-form');
        if (window.location.hash.length > 1) {
            $('#label').val(decodeURIComponent(window.location.hash.substring(1)));
        }
        $('#screen-form').submit(function(event){
            event.preventDefault();
            var creating = event.target.getAttribute("enctype") == "text/turtle";
            var slug = calli.slugify($('#label').val());
            var ns = calli.getFormAction(event.target).replace(/\?.*/,'').replace(/\/?$/, '/');
            var resource = creating ? ns + slug : $(event.target).attr('resource');
            if (creating) {
                event.target.setAttribute("resource", resource);
                calli.postTurtle(calli.getFormAction(event.target), calli.copyResourceData(event.target)).then(function(redirect){
                    screener.setItem("screen", screener.getItem("screen",'').split(' ').concat(redirect).join(' '));
                    window.location.replace(redirect);
                }).catch(calli.error);
            } else {
                calli.submitUpdate(comparision, event);
            }
        });
        $('#saveas').click(function(event){
            event.preventDefault();
            var form = $(event.target).closest('form')[0];
            var slug = calli.slugify($('#label').val());
            var type = $('#Screen').attr('href');
            var container = $('#container-resource').attr('resource');
            var resource = container.replace(/\/?$/, '/') + slug;
            form.setAttribute("resource", resource);
            calli.postTurtle(container + "?create=" + encodeURIComponent(type), calli.copyResourceData(form)).then(function(redirect){
                screener.setItem("screen", screener.getItem("screen",'').split(' ').concat(redirect).join(' '));
                window.location.replace(redirect);
            }).catch(calli.error);
        });
    }

    function initializeWatchList() {
        var fn = updateWatchList.bind(this, {});
        var loading = 0;
        var debounce = screener.debouncePromise(fn, 2000);
        $('select,input').change(function() {
            var counter = ++loading;
            $('.table').addClass("loading");
            return debounce.apply(this, arguments).then(function(resolved) {
                if (counter == loading)
                    $('.table').removeClass("loading");
                return resolved;
            }, function(error) {
                if (counter == loading)
                    $('.table').removeClass("loading");
                return Promise.reject(error);
            });
        });
    }

    function updateWatchList(cache) {
        var securityClasses = $('#security-class').val();
        var since = $('#since').prop('valueAsDate');
        var watch = $('[rel="screener:hasWatchCriteria"]').toArray().map(function(element){
            return element.getAttribute("resource");
        });
        var hold = $('[rel="screener:hasHoldCriteria"]').toArray().map(function(element){
            return element.getAttribute("resource");
        });
        if (_.isEmpty(securityClasses) || _.isEmpty(watch)) return Promise.resolve();
        $('.table').addClass("loading");
        return Promise.all([screener.inlineFilters(watch), screener.inlineFilters(hold)]).then(function(two){
            var watch = two[0];
            var hold = two[1];
            var now = new Date(screener.getItem("now", new Date()));
            var screen = {watch: watch, hold: hold};
            var key = JSON.stringify([securityClasses, screen, since]);
            if (cache[key]) {
                cache[key].promise = cache[key].promise.catch(function(){
                    return screener.screen(securityClasses, screen, since, now);
                });
            } else {
                cache[key] = {
                    asof: new Date(),
                    promise: screener.screen(securityClasses, screen, since, now)
                };
            }
            return cache[key].promise;
        }).then(function(list){
            updatePerformance(list);
            return screener.inlineFilters(hold).then(function(filters){
                var thead = $('#results-table thead tr');
                while (thead.children().length > 2) thead.children().last().remove();
                filters.forEach(function(filter){
                    var symbol = filter.percent || filter.percentWatch ? ' %' :
                        filter.difference || filter.differenceWatch ? ' Δ' : '';
                    thead.append($('<th></th>', {
                        title: filter.indicator.comment,
                        "class": "text-nowrap text-center",
                        "style": "white-space:nowrap"
                    }).text(filter.indicator.label + symbol));
                });
                if ($('#results-table').width() > $('#results-table').parent().width()) {
                    expandTable();
                }
                var target = $('#results-table').closest('form').length ? "_blank" : "_self";
                var rows = list.map(function(item){
                    // ticker
                    return $('<tr></tr>', {
                        resource: item.security,
                        "class": item.signal == 'stop' ? "text-muted" : ""
                    }).append($('<td></td>').append($('<a></a>', {
                        href: item.security,
                        target: target
                    }).text(decodeURIComponent(item.security.replace(/^.*\//,'')))));
                });
                $('#results-table tbody').empty().append(rows);
                $('.table').removeClass("loading");
                return Promise.all(list.map(function(item, i){
                    var tr = rows[i];
                    return screener.getSecurity(item.security).then(function(result){
                        return tr.append($('<td></td>').text(result && result.name || ''));
                    }).then(function(){
                        filters.forEach(function(filter){
                            try {
                                var ind = item[filter.indicator.interval.value][filter.indicator.expression];
                                var reference = filter.differenceWatch || filter.percentWatch ? item.watch : item;
                                var diff = filter.difference || filter.differenceWatch;
                                var dvalue = diff ? reference[diff.interval.value][diff.expression] : 0;
                                var percent = filter.percent || filter.percentWatch;
                                var prct = percent ? reference[percent.interval.value][percent.expression] : 100;
                                var value = (ind - dvalue) * 100 / prct;
                                var unit = percent ? 'percent' : filter.indicator.unit.value;
                                var format = unit == 'price'  ? '$' + value.toFixed(2) :
                                    unit == 'percent' ? value.toFixed(2) + '%' :
                                    screener.formatNumber(value);
                                tr.append($('<td></td>', {
                                    "class": "text-right",
                                    "data-value": value
                                }).text(format));
                            } catch(e) {
                                tr.append($('<td></td>'));
                            }
                        });
                    });
                })).then(function(){
                    if ($('#results-table tbody td').height() > 2 * $('#results-table tbody td a').height()) {
                        expandTable();
                    }
                });
            });
        }).then(function(){
            screener.sortTable('#results-table');
        }).catch(calli.error);
    }

    function expandTable() {
        $('#results-table').parent().removeClass("container");
        var thead = $('#results-table thead tr');
        thead.children('th').removeClass("text-nowrap");
        thead.children('th').css("white-space", "normal");
    }

    function updatePerformance(list) {
        var occurances = sum(list.map(function(item){
            return item.performance.length;
        }));
        var performance = sum(list.map(function(item){
            return item.performance.reduce(function(profit, ret){
                return profit + profit * ret / 100;
            }, 1) * 100 - 100;
        })) / list.length || 0;
        var avg = performance * list.length / occurances || 0;
        var sd = Math.sqrt(sum(_.flatten(list.map(function(item){
            return item.performance.map(function(num){
                var diff = num - avg;
                return diff * diff;
            });
        }))) / Math.max(occurances-1,1));
        var winners = _.flatten(list.map(function(item){
            return item.performance.filter(function(num){
                return num > 0;
            });
        }));
        var loosers = _.flatten(list.map(function(item){
            return item.performance.filter(function(num){
                return num < 0;
            });
        }));
        var drawup = list.reduce(function(drawup, item){
            if (item.positive_excursion > drawup) {
                return item.positive_excursion;
            } else return drawup;
        }, 0);
        var drawdown = list.reduce(function(drawdown, item){
            if (item.negative_excursion < drawdown) {
                return item.negative_excursion;
            } else return drawdown;
        }, 0);
        var exposure = sum(_.pluck(list, 'exposure'));
        var duration = sum(_.pluck(list, 'duration')) / list.length;
        var growth = cagr(performance, duration);
        var exposed_growth = cagr(performance, exposure /100 * duration / list.length);
        var avg_duration = exposure /100 * duration / occurances || 0;
        $('#security_count').text(list.length);
        $('#occurances').text(occurances);
        $('#average_duration').text(function(){
            if (avg_duration *52 > 1.5) {
                return(avg_duration *52).toFixed(0) + 'w';
            } else if (avg_duration *260 > 1.5) {
                return(avg_duration *260).toFixed(0) + 'd';
            } else if (avg_duration *260*6.5 > 1.5) {
                return(avg_duration *260*6.5).toFixed(0) + 'h';
            } else if (avg_duration *260*6.5*60 > 1.5) {
                return(avg_duration *260*6.5*60).toFixed(0) + 'm';
            } else if (avg_duration *260*6.5*60*60 > 1.5) {
                return(avg_duration *260*6.5*60*60).toFixed(0) + 's';
            } else {
                return(avg_duration *260*6.5*60*60).toFixed(3) + 's';
            }
        });
        $('#standard_deviation').text('±' + sd.toFixed(2) + '%');
        $('#average_performance').text(avg.toFixed(2) + '%');
        $('#percent_positive').text((winners.length / occurances * 100 || 0).toFixed(0) + '%');
        $('#positive_excursion').text(drawup.toFixed(2) + '%');
        $('#negative_excursion').text(drawdown.toFixed(2) + '%');
        $('#performance_factor').text(loosers.length ? (sum(winners) / -sum(loosers)).toFixed(1) : '');
        $('#performance').text(performance.toFixed(2) + '%');
        $('#annual_growth').text(Math.abs(growth) < 10 ? (growth * 100).toFixed(2) + '%' : '');
        $('#exposed_growth').text(Math.abs(exposed_growth) < 10 ? (exposed_growth * 100).toFixed(2) + '%' : '');
        return list;
    }

    function cagr(rate, years) {
        if (!years) return 0;
        if (rate < 0) return -1 * cagr(Math.abs(rate), years);
        else return Math.pow(1 + rate / 100, 1 / years) - 1;
    }

    function sum(numbers) {
        return numbers.reduce(function(sum, num){
            return sum + num;
        }, 0);
    }
});
