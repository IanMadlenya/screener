// security.js
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
        var security = window.location.href.substring(0, window.location.href.indexOf('?'));
    screener.listExchanges().then(function(result){
        return result.filter(function(exchange){
            return window.location.href.indexOf(exchange.iri) === 0;
        })[0];
    }).then(function(exchange){
        var ticker = security.substring(exchange.iri.length + 1);
        var symbol = exchange.mic + ':' + ticker;
        $('title').text(symbol);
        $('#page-title').text(symbol);
        return security;
    }).then(function(){
        return new Promise(function(resolve, reject) {
            google.load('visualization', '1.0', {
                packages: ['corechart'],
                callback: resolve
            });
        });
    }).then(function(){
        var now = new Date();
        var columns = ['date(asof)', 'low', 'open', 'close', 'high'];
        return screener.load(security, columns, 65, 'd1', now);
    }).then(function(rows){
        $(window).resize(draw.bind(this, rows));
        draw(rows);
    }).catch(calli.error);

    function draw(rows) {
        var table = new google.visualization.DataTable();
        table.addColumn('date', 'Day');
        table.addColumn('number', 'Price');
        table.addColumn('number');
        table.addColumn('number');
        table.addColumn('number');
        if (_.isArray(rows)) {
            table.addRows(rows);
        } else {
            console.log(rows);
        }
        google.visualization.drawChart({
            "containerId": "candlestick-div",
            "dataTable": table,
            "chartType": "ComboChart",
            "options": {
                seriesType: "line",
                series: {0: {type: "candlesticks"}},
                chartArea: {top: '0.5em', right: 0, width: '90%', height: '90%'},
                legend: {position: 'none'},
                candlestick: {
                    hollowIsRising: true,
                    fallingColor: {
                        strokeWidth: 1
                    },
                    risingColor: {
                        strokeWidth: 1
                    }
                },
                height: window.innerHeight - $("#candlestick-div").offset().top - 32,
                width: window.innerWidth
            }
        });
    }
});
