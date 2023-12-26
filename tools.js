const { checkOpacity, getHex, getOpacity, RGBA } = require('./utils.js');

const TerminalDisplayTools = function() {
	this.hex = (hex, opacity = 100) => hex + (checkOpacity(opacity) << 24);
	this.rgba = (r, g, b, a = 100) => (checkOpacity(a) << 24) + (r << 16) + (g << 8) + b;

	const colorPresets = {
		white: 0xffffff,
		grey: 0x808080,
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

	const randomPrimary = () => Math.floor(Math.random() * 256);
	const randomHex = () => (randomPrimary() << 16) + (randomPrimary() << 8) + randomPrimary();
	this.colors.random = () => this.hex(randomHex());

	this.getNegative = color => {
		const negativeHex = 0xffffff - (color & 0xffffff);
		return negativeHex + (getOpacity(color) << 24);
	}

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
			const RGBA1 = new RGBA(color1);
			const RGBA2 = new RGBA(color2 ? color2 : 0);

			const outputRGBA = new RGBA(
				lerp(RGBA1.r, RGBA2.r, t),
				lerp(RGBA1.g, RGBA2.g, t),
				lerp(RGBA1.b, RGBA2.b, t),
				lerp(RGBA1.a, RGBA2.a, t)
			);
			output[i] = outputRGBA.toCode();

			i++;
		} while (i < count);
		return output;
	}

	const rainbowHex = [0xff0000, 0xffff00, 0x00ff00, 0x00ffff, 0x0000ff, 0xff00ff, 0xff0000];
	this.rainbow = length => {
		const rainbow = rainbowHex.map(hex => this.hex(hex));
		return this.linearGradient(rainbow, length, false);
	}

	// BUFFER TOOLS
	this.outlineBuffer = (buffer, color) => {
		const sq = { tl: '┌', h: '─', tr: '┐', v: '│', bl: '└', br: '┘' };
		// Top line
		buffer.draw(sq.tl + sq.h.repeat(buffer.width - 2) + sq.tr, 0, 0, color);
		// Vertical walls
		for (let i = 1; i < buffer.height - 1; i++)
			buffer.draw(sq.v, 0, i, color).draw(sq.v, buffer.end, i, color);
		// Bottom line
		buffer.draw(sq.bl + sq.h.repeat(buffer.width - 2) + sq.br, 0, buffer.bottom, color);
		return buffer; // For buffer method chaining
	}

	this.centerWidth = (width, totalWidth) => Math.floor(totalWidth / 2 - width / 2);
	this.centerHeight = (height, totalHeight) => Math.floor(totalHeight / 2 - height / 2);

	/* TODO:
		[ ] this.positionBuffer(buffer, positionX, positionY);
		[ ] this.positionBufferX(buffer, positionX);
		[ ] this.positionBufferY(buffer, positionY);
	*/
}

module.exports = TerminalDisplayTools;
