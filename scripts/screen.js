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

    (function(updateWatchList){
        var selectizeIndicator = function(select) {
            var optgroups = {};
            return screener.listIndicators().then(function(list){
                return list.map(function(indicator){
                    var optgroup = indicator.interval.label + ' ' + indicator.unit.label;
                    optgroups[optgroup] = indicator;
                    return {
                        value: indicator.iri,
                        text: indicator.label,
                        optgroup: optgroup,
                        title: indicator.comment
                    };
                });
            }).then(function(options){
                var units = _.pluck(_.sortBy(_.pluck(optgroups, 'unit'), 'label'), 'value');
                var groups = _.sortBy(_.uniq(_.pluck(options, 'optgroup')), function(optgroup){
                    var indicator = optgroups[optgroup];
                    var i = indicator.interval.value == 'annual' ? 1 :
                            indicator.interval.value == 'quarter' ? 2 :
                            indicator.interval.value == 'd5' ? 3 :
                            indicator.interval.value == 'd1' ? 4 :
                            10 * +indicator.interval.value.substring(1);
                    return i * units.length + units.indexOf(indicator.unit.value);
                });
                return $(select).selectize({
                    options: _.sortBy(options, function(indicator){
                        return groups.indexOf(indicator.optgroup);
                    }),
                    optgroups: groups.map(function(optgroup){
                        return {
                            value: optgroup,
                            label: optgroup
                        };
                    })
                }).change();
            });
        };
        screener.listSecurityClasses().then(function(classes){
            return classes.map(function(indicator){
                return {
                    value: indicator.iri,
                    text: indicator.label
                };
            });
        }).then(function(options){
            $('#security-class').selectize({
                searchField: ["text", "value"],
                options: options,
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
                create: function(input, callback) {
                    var cls = $('#SecurityClass').prop('href');
                    var container = $('#container-resource').prop('href') || window.location.pathname;
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
                        return '<div style="white-space:nowrap;text-overflow:ellipsis;" title="' +  escape(data.title) + '">' +
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
                        if (data.title) return '<div class="" title="' + escape(data.title) + '">' + escape(data.text) + '</div>';
                        else return '<div onclick="calli.createResource(this, \'' + escape(data.value) + '?edit\').then(undefined, calli.error)">' +
                            escape(data.text) + '</div>';
                    }
                }
            }).change(updateWatchList);
        });
        var lastWeek = new Date();
        lastWeek.setDate(lastWeek.getDate() - 7);
        $('#since').prop('valueAsDate', lastWeek).change(updateWatchList);
        $('div[rel="screener:forIndicator"]').parent().each(function(){
            $(this).children('div[rel="screener:forIndicator"]').filter(calli.checkEachResourceIn($(this).children('select')[0])).remove();
        })
        $('select[name="indicator"]').toArray().forEach(selectizeIndicator);
        $('#watch').siblings('.add').click(function(event){
            event.preventDefault();
            calli.addResource(event,'#watch').then(function(div){
                $(div).find('select,input').change(updateWatchList);
                $(div).find('select[name="indicator"]').toArray().forEach(selectizeIndicator);
            });
        });
        $('#hold').siblings('.add').click(function(event){
            event.preventDefault();
            calli.addResource(event,'#hold').then(function(div){
                $(div).find('select,input').change(updateWatchList);
                $(div).find('select[name="indicator"]').toArray().forEach(selectizeIndicator);
            });
        });
    
        $('#label-dialog').modal({
            show: false,
            backdrop: false
        }).on('shown.bs.modal', function () {
            $('#label').focus()
        });
        $('#store').click(function(event){
            $('#label-dialog').modal('show');
        });
        $('#show-results-table').click(function(event){
            $('#results-table').parent().collapse('toggle');
            updateWatchList();
        });
        $('#results-table').parent().on('show.bs.collapse', function(){
            $('#show-results-table').children('.glyphicon').removeClass('glyphicon-expand').addClass('glyphicon-collapse-down');
        }).on('hidden.bs.collapse', function(){
            $('#show-results-table').children('.glyphicon').removeClass('glyphicon-collapse-down').addClass('glyphicon-expand');
        });
    })(screener.debouncePromise(updateWatchList));

    var comparision = $('#screen-form').attr("resource") && calli.copyResourceData('#screen-form');
    $('#screen-form').submit(function(event){
        event.preventDefault();
        var creating = event.target.getAttribute("enctype") == "text/turtle";
        var slug = calli.slugify($('#label').val());
        var ns = window.location.pathname.replace(/\/?$/, '/');
        var resource = creating ? ns + slug : $(event.target).attr('resource');
        var filters = $('[rel="screener:hasWatchCriteria"],[rel="screener:hasHoldCriteria"]');
        var counter = _.max([35].concat(filters.toArray().map(function(filter){
            return filter.getAttribute("resource");
        }).filter(function(iri){
            return iri.match(/#\w\w$/);
        }).map(function(iri){
            return parseInt(iri.substring(iri.lastIndexOf('#') + 1), 36);
        })));
        filters.each(function(){
            var indicator = $(this).find('[rel="screener:forIndicator"]').attr("resource");
            if (indicator) {
                $(this).attr("resource", resource + "#" + (++counter).toString(36));
            } else {
                $(this).remove();
            }
        });
        if (creating) {
            calli.submitTurtle(event,slug);
        } else {
            calli.submitUpdate(comparision, event);
        }
    });

    function updateWatchList() {
        var securityClasses = $('#security-class').val();
        var since = $('#since').prop('valueAsDate');
        var watch = readFilters('[rel="screener:hasWatchCriteria"]');
        var hold = readFilters('[rel="screener:hasHoldCriteria"]');
        if (_.isEmpty(securityClasses) || _.isEmpty(watch)) return;
        var now = new Date();
        var screen = {watch: watch, hold: hold};
        return screener.screen(securityClasses, screen, since, now).then(function(list){
            updatePerformance(since, now, list);
            if ($('#results-table').is(":hidden")) return;
            return Promise.all(hold.map(function(hold){
                return screener.getIndicator(hold.forIndicator);
            })).then(function(indicators){
                var thead = $('#results-table thead tr');
                while (thead.children().length > 2) thead.children().last().remove();
                indicators.forEach(function(indicator){
                    thead.append($('<th></th>', {
                        title: indicator.comment
                    }).text(indicator.label));
                });
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
                return Promise.all(list.map(function(item, i){
                    var tr = rows[i];
                    return screener.getSecurity(item.security).then(function(result){
                        return tr.append($('<td></td>').text(result && result.name || ''));
                    }).then(function(){
                        indicators.forEach(function(indicator){
                            var value = item[indicator.interval.value][indicator.expression];
                            var format = indicator.unit.value == 'price'  ?
                                    '$' + value.toFixed(2) :
                                indicator.unit.value == 'percent' ?
                                    value.toFixed(2) + '%' :
                                screener.formatNumber(value);
                            tr.append($('<td></td>', {
                                "class": "text-right",
                                "data-value": value
                            }).text(format));
                        });
                    });
                }));
            });
        });
    }

    function updatePerformance(since, now, list) {
        var occurances = sum(list.map(function(item){
            return item.performance.length;
        }));
        var performance = sum(list.map(function(item){
            return item.performance.reduce(function(profit, ret){
                return profit + profit * ret / 100;
            }, 1) * 100 - 100;
        })) / list.length;
        var avg = performance * list.length / occurances;
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
        var risk_adjusted = sum(list.map(function(item){
            return (item.performance.reduce(function(profit, ret){
                return profit + profit * ret / 100;
            }, 1) * 100 - 100) / item.exposure;
        })) / list.length;
        var exposure = sum(_.pluck(list, 'exposure'));
        var duration = (now.valueOf() - since.valueOf());
        var growth = Math.pow(1 + performance / 100, 365 * 24 * 60 * 60 * 1000 / duration) - 1;
        var risk_growth = Math.pow(1 + risk_adjusted / 100, 365 * 24 * 60 * 60 * 1000 / duration) - 1;
        var avg_duration = exposure * duration / occurances;
        $('#security_count').text(list.length);
        $('#occurances').text(occurances);
        $('#average_duration').text(function(){
            if (avg_duration > 24 * 60 * 60 * 1000) {
                return (avg_duration / 24 / 60 / 60 / 1000).toFixed(0) + ' d';
            } else if (avg_duration > 60 * 60 * 1000) {
                return (avg_duration / 60 / 60 / 1000).toFixed(0) + ' hr';
            } else if (avg_duration > 60 * 1000) {
                return (avg_duration / 60 / 1000).toFixed(0) + ' min';
            } else if (avg_duration > 1000) {
                return (avg_duration / 1000).toFixed(0) + ' sec';
            } else {
                return avg_duration + ' ms';
            }
        });
        $('#standard_deviation').text('±' + sd.toFixed(2) + '%');
        $('#average_performance').text(avg.toFixed(2) + '%');
        $('#percent_positive').text((winners.length / occurances * 100).toFixed(0) + '%');
        $('#positive_excursion').text(drawup.toFixed(2) + '%');
        $('#negative_excursion').text(drawdown.toFixed(2) + '%');
        $('#performance_factor').text(loosers.length ? (sum(winners) / -sum(loosers)).toFixed(1) : '');
        $('#performance').text(performance.toFixed(2) + '%');
        $('#annual_growth').text((growth * 100).toFixed(2) + '%');
        $('#risk_adjusted').text((risk_growth * 100).toFixed(2) + '%');
        return list;
    }

    function sum(numbers) {
        return numbers.reduce(function(sum, num){
            return sum + num;
        }, 0);
    }

    function readFilters(filterElements) {
        return $(filterElements).toArray().filter(function(elem){
            return $(elem).find('[rel="screener:forIndicator"]').attr("resource");
        }).map(function(elem){
            return {
                forIndicator: $(elem).find('[rel="screener:forIndicator"]').attr("resource"),
                lower: $(elem).find('[property="screener:lower"]').attr("content"),
                upper: $(elem).find('[property="screener:upper"]').attr("content")
            };
        });
    }
});
