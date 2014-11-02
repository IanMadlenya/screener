// test-calculations.js
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

jasmine.DEFAULT_TIMEOUT_INTERVAL = 1000 * 60;

describe("calculations", function(){
    describe("RSI", function(){
        it("stockchart", function(){
            var data = [
                [44.3389],
                [44.0902],
                [44.1497],
                [43.6124],
                [44.3278],
                [44.8264],
                [45.0955],
                [45.4245],
                [45.8433],
                [46.0826],
                [45.8931],
                [46.0328],
                [45.614],
                [46.282],
                [46.282,70.5327894837],
                [46.0028,66.3185618052],
                [46.0328,66.5498299355],
                [46.4116,69.4063053388],
                [46.2222,66.3551690563],
                [45.6439,57.9748557143],
                [46.2122,62.9296067546],
                [46.2521,63.2571475625],
                [45.7137,56.0592987153],
                [46.4515,62.3770714432],
                [45.7835,54.7075730813],
                [45.3548,50.4227744115],
                [44.0288,39.9898231454],
                [44.1783,41.4604819757],
                [44.2181,41.8689160925],
                [44.5672,45.4632124453],
                [43.4205,37.3040420899],
                [42.6628,33.0795229944],
                [43.1314,37.7729521144]
            ];
            var RSI = calculations.RSI(14, 'close').getValue;
            data.forEach(function(datum,i,data){
                var rsi = datum[1];
                var points = data.slice(0, i+1).map(function(datum){
                    return {
                        close: datum[0]
                    };
                });
                if (rsi) {
                    expect(RSI(points)).toBeCloseTo(rsi);
                }
            });
        });
    });
    describe("ATR", function(){
        it("stockchart", function(){
            var data = [
                [48.7,47.79,48.16],
                [48.72,48.14,48.61],
                [48.9,48.39,48.75],
                [48.87,48.37,48.63],
                [48.82,48.24,48.74],
                [49.05,48.635,49.03],
                [49.2,48.94,49.07],
                [49.35,48.86,49.32],
                [49.92,49.5,49.91],
                [50.19,49.87,50.13],
                [50.12,49.2,49.53],
                [49.66,48.9,49.5],
                [49.88,49.43,49.75],
                [50.19,49.725,50.03,0.555],
                [50.36,49.26,50.31,0.5939285714],
                [50.57,50.09,50.52,0.5857908163],
                [50.65,50.3,50.41,0.5689486152],
                [50.43,49.21,49.34,0.6154522855],
                [49.63,48.98,49.37,0.6179199794],
                [50.33,49.61,50.23,0.6423542666],
                [50.29,49.2,49.2375,0.6743289618],
                [50.17,49.43,49.93,0.6927697503],
                [49.32,48.08,48.43,0.7754290538],
                [48.5,47.64,48.18,0.7814698357],
                [48.3201,41.55,46.57,1.2092291331],
                [46.8,44.2833,45.41,1.3026199093],
                [47.8,47.31,47.77,1.3802899158],
                [48.39,47.2,47.72,1.366697779],
                [48.66,47.9,48.62,1.3362193662],
                [48.79,47.7301,47.85,1.3164822686]
            ];
            var ATR = calculations.ATR(14).getValue;
            data.forEach(function(datum,i,data){
                var atr = datum[3];
                var points = data.slice(0, i+1).map(function(datum){
                    return {
                        high: datum[0],
                        low: datum[1],
                        close: datum[2]
                    };
                });
                if (atr) {
                    expect(ATR(points)).toBeCloseTo(atr);
                }
            });
        });
    });
});
