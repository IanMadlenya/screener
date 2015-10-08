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
        });
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
                return screener.screen(screen.securityClasses, screen.criteria, screen.lookback).then(function(list){
                    return list.filter(function(item){
                        return item.signal != 'stop';
                    });
                });
            }));
        }).then(_.flatten).then(function(list){
            var target = $('#results-table').closest('form').length ? "_blank" : "_self";
            var rows = list.map(function(datum){
                // ticker
                return $('<tr></tr>', {
                    resource: datum.security,
                    "class": datum.signal == 'stop' ? "text-muted" : ""
                }).append($('<td></td>').append($('<a></a>', {
                    href: datum.security,
                    target: target
                }).text(decodeURIComponent(datum.security.replace(/^.*\//,'')))));
            });
            $('#results-table tbody').append(rows);
            if (_.find(list, 'gain')) {
                $('#results-table').removeClass("no-estimate");
            } else {
                $('#results-table').addClass("no-estimate");
            }
            return Promise.all(list.map(function(datum, i){
                var tr = rows[i];
                return screener.getSecurity(datum.security).then(function(result){
                    return tr.append($('<td></td>').text(result && result.name || ''));
                }).then(function(){
                    tr.append($('<td></td>', {
                        "class": "text-right",
                        "data-value": datum.price
                    }).text('$' + datum.price.toFixed(2)));
                    tr.append(percentCell(datum.gain).addClass("estimate text-success"));
                    tr.append(percentCell(datum.pain).addClass("estimate text-danger"));
                    tr.append(decimalCell(datum.gain / Math.abs(datum.pain)).addClass("estimate"));
                    tr.append(percentCell(datum.positive_excursion).addClass("text-success"));
                    tr.append(percentCell(datum.negative_excursion).addClass("text-danger"));
                    tr.append(decimalCell(datum.performance.reduce(function(gain, ret){
                        return ret > 0 ? ret + gain : gain;
                    }, 0) / Math.abs(datum.performance.reduce(function(pain, ret){
                        return ret < 0 ? ret + pain : pain;
                    }, 0))));
                    var performance = datum.performance.reduce(function(profit, ret){
                        return profit + profit * ret / 100;
                    }, 1) * 100 - 100;
                    tr.append(percentCell(performance).attr("data-value", performance));
                    var exposed = datum.exposure /100 * datum.duration;
                    tr.append($('<td></td>', {
                        "class": "text-right",
                        "data-value": exposed
                    }).text(formatDuration(exposed)));
                });
            }));
        }).then(function(){
            screener.sortTable('#results-table');
        }).catch(calli.error).then(function(){
            $('#results-table').removeClass("loading");
        });
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
