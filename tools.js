const { checkOpacity, getHex, getOpacity } = require('./utils.js');

const BufferTools = function(manager) {
	// COLOR TOOLS
	/*
	const getOpacity = code => code >> 24;
	const getHex = code => code & 0xffffff;
	const checkOpacity = opacity => {
		if (opacity < 0) return 0;
		if (opacity > 100) return 100;
		return opacity;
	}
	*/

	const RGBA = function(r, g, b, a) {
		this.r = r; this.g = g; this.b = b; this.a = a;
	}
	const getRGBA = color => {
		const hex = getHex(color);
		return new RGBA(hex >> 16, (hex >> 8) & 0xff, hex & 0xff, color >> 24);
	}
	const setRGBA = rgba =>
		(Math.round(rgba.a) << 24) +
		(Math.round(rgba.r) << 16) +
		(Math.round(rgba.g) << 8) +
		Math.round(rgba.b);
	const emptyRGBA = new RGBA(0, 0, 0, 0);

	this.hex = (hex, opacity = 100) => hex + (checkOpacity(opacity) << 24);
	this.rgba = (r, g, b, a = 100) => (checkOpacity(a) << 24) + (r << 16) + (g << 8) + b;

	const colorPresets = {
		white: 0xffffff,
		gray: 0x808080,
		black: 0,
		red: 0xff0000,
		orange: 0xffa500,
		yellow: 0xffff00,
		green: 0x00ff00,
		cyan: 0x00ffff,
		blue: 0x0000ff,
		magenta: 0xff00ff,
	};

	this.color = (name, opacity = 100) => colorPresets[name] + (opacity << 24);
	this.colors = {};
	for (const [name, value] of Object.entries(colorPresets))
		this.colors[name] = this.hex(value);

	this.linearGradient = (colorArray, count, inclusive = true) => {
		const output = new Uint32Array(count);
		const lerp = (start, end, t) => (1 - t) * start + t * end;
		const lastIndex = colorArray.length - 1;
		const end = count - inclusive;
		let u = 0;
		let i = 0;
		do { // Loop [count] times
			u = lerp(0, lastIndex, i / end);
			const index = Math.floor(u);
			const t = u - index;

			const color1 = colorArray[index];
			const color2 = colorArray[index + 1];
			const RGBA1 = getRGBA(color1);
			const RGBA2 = color2 ? getRGBA(color2) : emptyRGBA;

			const outputRGBA = new RGBA(
				lerp(RGBA1.r, RGBA2.r, t),
				lerp(RGBA1.g, RGBA2.g, t),
				lerp(RGBA1.b, RGBA2.b, t),
				lerp(RGBA1.a, RGBA2.a, t)
			);
			output[i] = setRGBA(outputRGBA);

			i++;
		} while (i < count);
		return output;
	}

	const rainbowHex = [0xff0000, 0xffff00, 0x00ff00, 0x00ffff, 0x0000ff, 0xff00ff, 0xff0000];
	this.rainbow = length => {
		const rainbow = rainbowHex.map(hex => this.hex(hex));
		return this.linearGradient(rainbow, length, false);
	}

	this.outline
}

module.exports = BufferTools;
