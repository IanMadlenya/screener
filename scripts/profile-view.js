// profile-view.js
/* 
 *  Copyright (c) 2015 James Leigh Services Inc., Some Rights Reserved
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

    if (window.location.hash.indexOf("#socket=") === 0) {
        try {
            window.localStorage.setItem("socket", window.location.hash.substring("#socket=".length));
        } catch (e) {
            if (console) console.error(e);
        }
    }
    screener.setProfile(window.location.href).catch(console.log.bind(console));

    (function(updateWatchList){
        screener.listScreens().then(function(screens){
            return screens.map(function(screen){
                return {
                    value: screen.iri,
                    text: screen.label
                };
            });
        }).then(function(options){
            $('#screen').selectize({
                options: options,
                items: screener.getItem("screen", '').split(' '),
                closeAfterSelect: true,
                create: function(input, callback) {
                    var cls = $('#Screen').prop('href');
                    var container = $('#container-resource').attr('resource') || window.location.pathname;
                    var url = container + "?create=" + encodeURIComponent(cls) + "#" + encodeURIComponent(input);
                    window.location = url;
                },
                render: {
                    item: function(data, escape) {
                        return '<div><a href="' + escape(data.value) + '">' +
                            escape(data.text) + '</a></div>';
                    }
                }
            }).change(function(event){
                screener.setItem("screen", ($(event.target).val() || []).join(' '));
            }).change(updateWatchList).change();
        }).catch(calli.error);
    })(screener.debouncePromise(updateWatchList, 500));

    function updateWatchList() {
        if (_.isEmpty($('#screen').val())) return;
        $('#results-table').addClass("loading");
        return screener.listScreens().then(function(screens){
            return screens.filter(function(screen){
                return $('#screen').val().indexOf(screen.iri) >= 0;
            });
        }).then(function(screens){
            return Promise.all(screens.map(function(screen){
                if (_.isEmpty(screen.securityClasses) || _.isEmpty(screen.criteria)) return [];
                return screener.screen(screen.securityClasses, screen.criteria, screen.lookback);
            }));
        }).then(_.flatten).then(function(list){
            if (_.some(_.pluck(list, 'watch'), 'gain')) {
                $('#results-table').removeClass("no-estimate");
            } else {
                $('#results-table').addClass("no-estimate");
            }
            return _.groupBy(list, 'security');
        }).then(function(occurrences){
            return _.omit(occurrences, function(list){
                return _.last(list).stop;
            });
        }).then(function(occurrences){
            var target = $('#screen-form').length ? "_blank" : "_self";
            var securities = _.keys(occurrences).sort();
            var rows = securities.map(function(security){
                // ticker
                return $('<tr></tr>', {
                    resource: security,
                    "class": _.last(occurrences[security]).stop ? "text-muted" : ""
                }).append($('<td></td>').append($('<a></a>', {
                    href: security,
                    target: target
                }).text(decodeURIComponent(security.replace(/^.*\//,'')))));
            });
            $('#results-table tbody').empty().append(rows);
            $('.table').removeClass("loading");
            return Promise.all(securities.map(function(security, i){
                var tr = rows[i];
                var list = occurrences[security];
                return screener.getSecurity(security).then(function(result){
                    return tr.append($('<td></td>', {
                        "class": "text-ellipsis",
                        title: result ? result.name : ''
                    }).text(result ? result.name : ''));
                }).then(function(){
                    var datum = _.last(list);
                    var hold = (datum.stop || datum.hold || datum.watch);
                    tr.append($('<td></td>', {
                        "class": "text-right",
                        "data-value": hold.price
                    }).text('$' + hold.price.toFixed(2)));
                    var positive = datum.stop ? "text-muted" : "text-success";
                    var negative = datum.stop ? "text-muted" : "text-danger";
                    var change = hold.price - datum.watch.price;
                    tr.append($('<td></td>', {
                        "class": "text-right " + (change < 0 ? negative : positive),
                        "data-value": change
                    }).text('$' + change.toFixed(2)));
                    tr.append(percentCell(hold.gain).addClass("estimate " + positive));
                    tr.append(percentCell(hold.pain).addClass("estimate " + negative));
                    tr.append(decimalCell(hold.gain / Math.abs(hold.pain)).addClass("estimate"));
                    var positive_excursion = avg_annual_positive_excursion(list);
                    var negative_excursion = avg_annual_negative_excursion(list);
                    tr.append(percentCell(positive_excursion).addClass(positive));
                    tr.append(percentCell(negative_excursion).addClass(negative));
                    var wins = list.reduce(function(gain, datum){
                        return datum.performance > 0 ? datum.performance + gain : gain;
                    }, 0);
                    var losses = list.reduce(function(pain, datum){
                        return datum.performance < 0 ? datum.performance + pain : pain;
                    }, 0);
                    var factor = wins && losses ? wins / Math.abs(losses) :
                        positive_excursion / Math.abs(negative_excursion);
                    tr.append(decimalCell(factor));
                    var performance = list.reduce(function(profit, datum){
                        return profit + profit * datum.performance / 100;
                    }, 1) * 100 - 100;
                    tr.append(percentCell(performance).attr("data-value", performance));
                    var exposed = sum(_.pluck(list, 'exposure')) /100;
                    tr.append($('<td></td>', {
                        "class": "text-right",
                        "data-value": exposed
                    }).text(formatDuration(exposed)));
                });
            }));
        }).then(function(){
            screener.sortTable('#results-table');
        }).catch(calli.error);
    }

    function percentCell(value) {
        if (_.isFinite(value)) return $('<td></td>', {
            "class": "text-right"
        }).text(value.toFixed(2) + '%');
        else return $('<td></td>');
    }

    function decimalCell(value) {
        if (_.isFinite(value)) return $('<td></td>', {
            "class": "text-right",
            "data-value": value
        }).text(value.toFixed(2));
        else return $('<td></td>');
    }

    function avg_annual_positive_excursion(list) {
        var positive_excursions = list.reduce(function(runup, datum){
            var year = datum.watch.asof.substring(0, 4);
            runup[year] = Math.max(datum.positive_excursion, runup[year] || 0);
            return runup;
        }, {});
        return sum(positive_excursions)/_.size(positive_excursions);
    }

    function avg_annual_negative_excursion(list) {
        var negative_excursions = list.reduce(function(drawdown, datum){
            var year = datum.watch.asof.substring(0, 4);
            drawdown[year] = Math.min(datum.negative_excursion, drawdown[year] || 0);
            return drawdown;
        }, {});
        return sum(negative_excursions)/_.size(negative_excursions);
    }

    function sum(numbers) {
        return _.reduce(numbers, function(sum, num){
            return sum + num;
        }, 0);
    }

    function formatDuration(years) {
        if (years *52 > 1.5) {
            return(years *52).toFixed(0) + 'w';
        } else if (years *260 > 1.5) {
            return(years *260).toFixed(0) + 'd';
        } else if (years *260*6.5 > 1.5) {
            return(years *260*6.5).toFixed(0) + 'h';
        } else if (years *260*6.5*60 > 1.5) {
            return(years *260*6.5*60).toFixed(0) + 'm';
        } else if (years *260*6.5*60*60 > 1.5) {
            return(years *260*6.5*60*60).toFixed(0) + 's';
        } else {
            return(years *260*6.5*60*60).toFixed(3) + 's';
        }
    }
});
