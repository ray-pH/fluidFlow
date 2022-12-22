/*
 * fluidSim.js
 * Copyright (C) 2022 ray <ray@ray-pH-ASUS>
 *
 * Distributed under terms of the MIT license.
 */

function clamp(x, min,max){
    return Math.min(max, Math.max(min, x));
}

class FluidSimulator {
    constructor(density, nx, ny, h, dt, n_iter, over_relaxation) {
        this.density = density;
        this.nx = nx ; 
        this.ny = ny ;
        this.h  = h;

        this.n_iter = n_iter;
        this.dt = dt;

        var  n  = this.nx * this.ny;
        this.Vx = new Float32Array(n);
        this.Vy = new Float32Array(n);

        this.P   = new Float32Array(n); //pressure
        this.S   = new Float32Array(n); //object 0 : solid obstacle, 1 : none
        this.Dye = new Float32Array(n); //dye    0 : filled        , 1 : none
        this.S.fill(1.0)
        this.Dye.fill(1.0)

        // helper fields
        this.div    = new Float32Array(n);
        this.ss     = new Float32Array(n);
        this.Vxnew  = new Float32Array(n);
        this.Vynew  = new Float32Array(n);
        this.Dyenew = new Float32Array(n);

        // parameter for SOR solver
        this.over_relaxation = over_relaxation;
    }


    solveDivergence() {
        var nx = this.nx;
        var cp = this.density * this.h / this.dt;

        for (var k = 0; k < this.n_iter; k++) {
            for (var i = 1; i < this.nx-1; i++) { for (var j = 1; j < this.ny-1; j++) {

                if (this.S[i + nx*j] == 0.0) continue;

                var sx0 = this.S[i-1 + nx*j];
                var sx1 = this.S[i+1 + nx*j];
                var sy0 = this.S[i   + nx*(j-1)];
                var sy1 = this.S[i   + nx*(j+1)];
                var s = sx0 + sx1 + sy0 + sy1;
                if (s == 0.0) continue;

                var div = this.Vx[i+1 + nx*j] - this.Vx[i + nx*j] + 
                          this.Vy[i + nx*(j+1)] - this.Vy[i + nx*j];
                this.div[i + nx*j] = div;
                this.ss [i + nx*j] = s  ;

                var p = -div/s;
                p *= this.over_relaxation;
                this.P[i + nx*j] += cp * p;
                // console.log(cp*p);

                this.Vx[i   + nx*j    ] -= sx0 * p;
                this.Vx[i+1 + nx*j    ] += sx1 * p;
                this.Vy[i   + nx*j    ] -= sy0 * p;
                this.Vy[i   + nx*(j+1)] += sy1 * p;
            } }
        }
    }

    calculatePressure(){

    }

    extrapolateBoundary() {
        var nx = this.nx;
        for (var i = 0; i < this.nx; i++) {
            this.Vx[i + nx*0] = this.Vx[i + nx*1];
            this.Vx[i + nx*(this.ny-1)] = this.Vx[i + nx*(this.ny-2)]; 
        }
        for (var j = 0; j < this.ny; j++) {
            this.Vy[0 + nx*j] = this.Vy[1 + nx*j];
            this.Vy[(this.nx-1) + nx*j] = this.Vy[(this.nx-2) + nx*j] 
        }
    }

    interpolateFromField(x, y, field) {
        var nx = this.nx;
        var h = this.h;

        var i = clamp(x/h, 1, this.nx-1);
        var j = clamp(y/h, 1, this.ny-1);

        var i0 = Math.floor(i - 0.5);
        var i1 = i0 + 1;
        var j0 = Math.floor(j - 0.5)
        var j1 = j0 + 1;

        var tx = ((i-0.5) - i0);
        var ty = ((j-0.5) - j0);

        var sx = 1.0 - tx;
        var sy = 1.0 - ty;

        var val = sx*sy * field[i0 + nx*j0] +
                  tx*sy * field[i1 + nx*j0] +
                  tx*ty * field[i1 + nx*j1] +
                  sx*ty * field[i0 + nx*j1];
        return val;
    }

    avgVx(i, j) {
        var nx = this.nx;
        return (this.Vx[i   + nx*(j-1)] + this.Vx[i   + nx*j] +
                this.Vx[i+1 + nx*(j-1)] + this.Vx[i+1 + nx*j]) * 0.25;
    }

    avgVy(i, j){
        var nx = this.nx;
        return (this.Vy[i-1 + nx*j]     + this.Vy[i + nx*j] +
                this.Vy[i-1 + nx*(j+1)] + this.Vy[i + nx*(j+1)]) * 0.25;
    }

    advectVel() {
        this.Vxnew.set(this.Vx);
        this.Vynew.set(this.Vy);

        var dt = this.dt;
        var nx = this.nx;
        var h = this.h;

        for (var i = 1; i < this.nx-1; i++) { for (var j = 1; j < this.ny-1; j++) {

            if (this.S[i + nx*j] == 0.0) continue;

            // consider point in the center of the grid
            var xn = i*h + 0.5*h;
            var yn = j*h + 0.5*h;

            // x component
            if (this.S[i-1 + nx*j] != 0.0) {
                var vx = this.Vx[i + nx*j];
                // var vy = this.Vy[i + nx*j];
                // var vx = this.avgVx(i, j);
                var vy = this.avgVy(i, j);
                var x  = xn - vx*dt;
                var y  = yn - vy*dt;
                this.Vxnew[i + nx*j] = this.interpolateFromField(x,y, this.Vx);
            }
            // y component
            if (this.S[i + nx*(j-1)] != 0.0) {
                var vx = this.avgVx(i, j);
                // var vy = this.avgVy(i, j);
                // var vx = this.Vx[i + nx*j];
                var vy = this.Vy[i + nx*j];
                var x  = xn - vx*dt;
                var y  = yn - vy*dt;
                this.Vynew[i + nx*j] = this.interpolateFromField(x,y, this.Vy);
            }
        } }

        this.Vx.set(this.Vxnew);
        this.Vy.set(this.Vynew);
    }

    advectDye() {
        var dt = this.dt;
        this.Dyenew.set(this.Dye);
        var nx = this.nx; var h = this.h;
        for (var i = 1; i < this.nx-1; i++) { for (var j = 1; j < this.ny-1; j++) {
            if (this.S[i + nx*j] == 0.0) continue;
            // var vx = (this.Vx[i + nx*j] + this.Vx[(i+1) + nx*j]) * 0.5;
            // var vy = (this.Vy[i + nx*j] + this.Vy[i + nx*(j+1)]) * 0.5;
            var vx = this.Vx[i + nx*j];
            var vy = this.Vy[i + nx*j];
            var x  = i*h + 0.5*h - vx*dt;
            var y  = j*h + 0.5*h - vy*dt;
            this.Dyenew[i + nx*j] = this.interpolateFromField(x,y, this.Dye);
        }}
        this.Dye.set(this.Dyenew);
    }

    simulate() {
        this.P.fill(0.0);
        this.solveDivergence();

        this.extrapolateBoundary();
        this.advectVel();
        this.advectDye();
    }
}


function hex2rgb(h){
    var r = (0xFF) & (h >> 16);
    var g = (0xFF) & (h >> 8);
    var b = (0xFF) & (h >> 0);
    return [r,g,b,255];
}

function sciColor(val, minVal, maxVal) {
    var range = maxVal - minVal;
    val = clamp(val, minVal, maxVal - 0.0001);
    val = (range == 0.0) ? 0.5 : (val - minVal) / range;
    var m = 0.25;
    var num = Math.floor(val / m);
    var s = (val - num * m) / m;
    var r, g, b;
    switch (num) {
        case 0 : r = 0.0; g = s;       b = 1.0;   break;
        case 1 : r = 0.0; g = 1.0;     b = 1.0-s; break;
        case 2 : r = s;   g = 1.0;     b = 0.0;   break;
        case 3 : r = 1.0; g = 1.0 - s; b = 0.0;   break;
    }
    return[255*r,255*g,255*b, 255]
}

class FluidRenderer{
    constructor(fluidsim, canvas){
        this.fluidsim = fluidsim;
        this.canvas   = canvas;

        this.ctx      = canvas.getContext('2d');
        this.width    = canvas.width;
        this.height   = canvas.height;

        var scale = canvas.height/fluidsim.ny;
        this.ctx.clearRect(0, 0, this.width, this.height);
        this.ctx.scale(scale,scale);
        this.ctx.imageSmoothingEnabled = false; // -> nearest-neighbor interpolation
        
        // temp canvas to store original values
        this.temp_canvas        = document.createElement('canvas');
        this.temp_canvas.width  = fluidsim.nx;
        this.temp_canvas.height = fluidsim.ny;
        this.temp_ctx      = this.temp_canvas.getContext('2d');
        this.temp_img_data = this.temp_ctx.getImageData(0,0, this.temp_canvas.width, this.temp_canvas.height);
        this.temp_pixels   = this.temp_img_data.data;
    }

    drawStreamline(){
        var h = this.fluidsim.h;
        var segLen = h * 0.2;
        var numSegs = 15;

        this.ctx.strokeStyle = "#000000";
        this.ctx.lineWidth = 0.1;

        for (var i = 1; i < this.fluidsim.nx - 1; i += 5) {
            for (var j = 1; j < this.fluidsim.ny - 1; j += 5) {

                var x = (i + 0.5) * h;
                var y = (j + 0.5) * h;

                this.ctx.beginPath();
                // c.moveTo(cX(x), cY(y));
                this.ctx.moveTo(x/h, y/h);

                for (var n = 0; n < numSegs; n++) {
                    var u = this.fluidsim.interpolateFromField(x, y, this.fluidsim.Vx);
                    var v = this.fluidsim.interpolateFromField(x, y, this.fluidsim.Vy);
                    var l = Math.sqrt(u*u + v*v);
                    // x += u/l * segLen;
                    // y += v/l * segLen;
                    x += u * 0.01;
                    y += v * 0.01;
                    if (x > this.fluidsim.nx * this.fluidsim.h) break;
                    this.ctx.lineTo(x/h, y/h);
                }
                this.ctx.stroke();
            }
        }
    }

    draw() {
        this.ctx.clearRect(0, 0, canvas.width, canvas.height);

        var fl = this.fluidsim;
        var nx = fl.nx;

        var color = [255, 255, 255, 255];
        for (var i = 0; i < fl.nx; i++) { for (var j = 0; j < fl.ny; j++) {
            var s = fl.Dye[i + nx*j];
            color[0] = 255*s;
            color[1] = 255*s;
            color[2] = 255*s;

            // #9bb6e0
            if (fl.S[i + nx*j] == 0) color = hex2rgb(0x9BB6E0); //obstacle

            var p = 4 * (j * this.temp_canvas.width + i);
            this.temp_pixels[p+0] = color[0];
            this.temp_pixels[p+1] = color[1];
            this.temp_pixels[p+2] = color[2];
            this.temp_pixels[p+3] = color[3];
        }}


        // put data into temp_canvas
        this.temp_ctx.putImageData(this.temp_img_data, 0, 0);
        // draw into original canvas
        this.ctx.drawImage(this.temp_canvas, 0, 0);
    }

    drawPressure(){
        var fl = this.fluidsim;
        var p_min, p_max;
        p_min = p_max = fl.P[0];
        for (var i = 0; i < fl.nx * fl.ny; i++) {
            p_min = Math.min(p_min, fl.P[i]);
            p_max = Math.max(p_max, fl.P[i]);
        }
        console.log(fl.P);
        console.log(p_min, p_max);
        for (var i = 0; i < fl.nx; i++) { for (var j = 0; j < fl.ny; j++) {
            var p = fl.P[i + (fl.nx)*j];
            var color = sciColor(p, p_min, p_max);
            var ptr = 4 * (j * this.temp_canvas.width + i);
            this.temp_pixels[ptr+0] = color[0];
            this.temp_pixels[ptr+1] = color[1];
            this.temp_pixels[ptr+2] = color[2];
            this.temp_pixels[ptr+3] = color[3];
        }}
        // put data into temp_canvas
        this.temp_ctx.putImageData(this.temp_img_data, 0, 0);
        // draw into original canvas
        this.ctx.drawImage(this.temp_canvas, 0, 0);
    }
}

export {FluidSimulator, FluidRenderer};