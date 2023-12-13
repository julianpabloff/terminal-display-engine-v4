// Colors - 32 bit integer
// 0000 0000 0000 0000 0000 0000 0000 0000
// [opacity] [       24 bit color        ]
const getHex = colorCode => colorCode & 0xffffff;
const getOpacity = colorCode => colorCode >> 24;
const checkOpacity = opacity => {
	if (opacity < 0) return 0;
	if (opacity > 100) return 100;
	return opacity;
}

const fadeColor = (colorCode, opacity) => {
	const newOpacity = Math.floor(getOpacity(colorCode) * (opacity / 100));
	return getHex(colorCode) + (newOpacity << 24);
}

// const rgba = new RGBA(colorCode);
// const rgba = new RGBA(r, g, b, a);
const RGBA = function(colorInput = 0) {
	if (arguments.length == 1) {
		const hex = getHex(colorInput);
		this.r = hex >> 16;
		this.g = (hex >> 8) & 0xff;
		this.b = hex & 0xff;
		this.a = getOpacity(colorInput);
	} else {
		this.r = arguments[0];
		this.g = arguments[1];
		this.b = arguments[2];
		this.a = arguments[3];
	}

	this.toCode = () =>
		(Math.round(this.a) << 24) +
		(Math.round(this.r) << 16) +
		(Math.round(this.g) << 8) +
		Math.round(this.b);
}

const layeredRGBA = (topRGBA, bottomRGBA) => {
	const topOpacity = topRGBA.a;
	if (!topOpacity) return bottomRGBA;
	if (topOpacity > 99) return topRGBA;
	const calcValue = (top, bottom) => top + (bottom - top) * (100 - topOpacity) / 100;
	return new RGBA(
		calcValue(topRGBA.r, bottomRGBA.r),
		calcValue(topRGBA.g, bottomRGBA.g),
		calcValue(topRGBA.b, bottomRGBA.b),
		100
	);
}

const hexDebugString = color => {
	if (!color) return resetString + '[empty]' + resetString;
	const hex = getHex(color);
	const ansi = fgHexToString(hex);
	const hexString = hex.toString(16);
	const filler = '0'.repeat(6 - hexString.length);
	return ansi + '#' + filler + hexString + resetString;
}

module.exports = {
	checkOpacity,
	fadeColor,
	getHex,
	getOpacity,
	hexDebugString,
	layeredRGBA,
	RGBA
};
