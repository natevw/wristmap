DEBUG = false;
exports = {};
Buffer = Array;

var ctx = document.createElement('canvas').getContext('2d');
ctx.drawImage(document.body.firstElementChild,0,0);
//var px = ctx.getImageData(0,0,ctx.canvas.width,ctx.canvas.height).data;
var px = ctx.getImageData(0,0,144,168-16).data;

var bitmap = [],
    bit = 0;
for (var i = 0, len = px.length; i < len; i += 4) if (px[i] < 128) {
    var idx = (bit / 8) >> 0,
        sft = 7 - (bit % 8);
    bitmap[idx] |= (1 << sft);
    ++bit
} else ++bit;

// cut-n-paste-n-replace from TIFF6.pdg pp.45–46

var CODES = [           // NOTE: makeup EOL moved to first place, easier to find and then MAKEUP[rl/64] matches
    {   // white
        terminating: [_('00110101'),_('000111'),_('0111'),_('1000'),_('1011'),_('1100'),_('1110'),_('1111'),_('10011'),_('10100'),_('00111'),_('01000'),_('001000'),_('000011'),_('110100'),_('110101'),_('101010'),_('101011'),_('0100111'),_('0001100'),_('0001000'),_('0010111'),_('0000011'),_('0000100'),_('0101000'),_('0101011'),_('0010011'),_('0100100'),_('0011000'),_('00000010'),_('00000011'),_('00011010'),_('00011011'),_('00010010'),_('00010011'),_('00010100'),_('00010101'),_('00010110'),_('00010111'),_('00101000'),_('00101001'),_('00101010'),_('00101011'),_('00101100'),_('00101101'),_('00000100'),_('00000101'),_('00001010'),_('00001011'),_('01010010'),_('01010011'),_('01010100'),_('01010101'),_('00100100'),_('00100101'),_('01011000'),_('01011001'),_('01011010'),_('01011011'),_('01001010'),_('01001011'),_('00110010'),_('00110011'),_('00110100')],
        makeup: [_('000000000001'),_('11011'),_('10010'),_('010111'),_('0110111'),_('00110110'),_('00110111'),_('01100100'),_('01100101'),_('01101000'),_('01100111'),_('011001100'),_('011001101'),_('011010010'),_('011010011'),_('011010100'),_('011010101'),_('011010110'),_('011010111'),_('011011000'),_('011011001'),_('011011010'),_('011011011'),_('010011000'),_('010011001'),_('010011010'),_('011000'),_('010011011')]
    },
    {   // black
        terminating: [_('0000110111'),_('010'),_('11'),_('10'),_('011'),_('0011'),_('0010'),_('00011'),_('000101'),_('000100'),_('0000100'),_('0000101'),_('0000111'),_('00000100'),_('00000111'),_('000011000'),_('0000010111'),_('0000011000'),_('0000001000'),_('00001100111'),_('00001101000'),_('00001101100'),_('00000110111'),_('00000101000'),_('00000010111'),_('00000011000'),_('000011001010'),_('000011001011'),_('000011001100'),_('000011001101'),_('000001101000'),_('000001101001'),_('000001101010'),_('000001101011'),_('000011010010'),_('000011010011'),_('000011010100'),_('000011010101'),_('000011010110'),_('000011010111'),_('000001101100'),_('000001101101'),_('000011011010'),_('000011011011'),_('000001010100'),_('000001010101'),_('000001010110'),_('000001010111'),_('000001100100'),_('000001100101'),_('000001010010'),_('000001010011'),_('000000100100'),_('000000110111'),_('000000111000'),_('000000100111'),_('000000101000'),_('000001011000'),_('000001011001'),_('000000101011'),_('000000101100'),_('000001011010'),_('000001100110'),_('000001100111')],
        makeup: [_('00000000000'),_('0000001111'),_('000011001000'),_('000011001001'),_('000001011011'),_('000000110011'),_('000000110100'),_('000000110101'),_('0000001101100'),_('0000001101101'),_('0000001001010'),_('0000001001011'),_('0000001001100'),_('0000001001101'),_('0000001110010'),_('0000001110011'),_('0000001110100'),_('0000001110101'),_('0000001110110'),_('0000001110111'),_('0000001010010'),_('0000001010011'),_('0000001010100'),_('0000001010101'),_('0000001011010'),_('0000001011011'),_('0000001100100'),_('0000001100101')]
    
    }
];

var EXTRA_MAKEUP = [_('00000001000'),_('00000001100'),_('00000001101'),_('000000010010'),_('000000010011'),_('000000010100'),_('000000010101'),_('000000010110'),_('000000010111'),_('000000011100'),_('000000011101'),_('000000011110'),_('000000011111')];
Array.prototype.push.apply(CODES[0].makeup, EXTRA_MAKEUP);
Array.prototype.push.apply(CODES[1].makeup, EXTRA_MAKEUP);
var MAX_MAKEUP_IDX = CODES[0].makeup.length - 1;

function _(s) {
    return [parseInt(s,2), s.length];
}

exports.compress = function (bitmap) {
    var bit = 0,
        bml = bitmap.length * 8,
        black = (bitmap[0] >> 7) & 1,
        bufBit = 0,
        buffer = Buffer(bitmap.length);
    if (black) output(0);
    while (bit < bml && bufBit < bml) {
        var rl = 1;         // optimization: we've already ready previous (state-changing) bit
        while (bit++ < bml && bitMatches()) ++rl;
        black ^= 1;
        output(rl);
    }
    
    // return compressed data iff it is smaller than the original
    if (1 || DEBUG) console.log("Input:",bit, "Output:",bufBit, "ratio",bufBit/bit);
    return (bufBit < bml) ? buffer.slice(0, (bufBit / 8) >> 0) : null;
    
    function bitMatches() {
        var idx = (bit / 8) >> 0,
            sft = 7 - (bit % 8);
        return black === ((bitmap[idx] >> sft) & 1);
    }
    
    function output(rl) {   // this outputs for the *previous* state to keep optimization above clean
        if (DEBUG) console.log(black ^ 1, 'rl', rl);
        var clr = black ^ 1;
        while (rl > 63) {
            var idx = Math.min((rl / 64) >> 0, MAX_MAKEUP_IDX);
            append(CODES[clr].makeup[idx]);
            rl -= 64 * idx;
        }
        append(CODES[clr].terminating[rl]);
    }
    function append(pair) {
        if (DEBUG) {
            var str1 = pair[0].toString(2),
                str0 = (1 << (pair[1] - str1.length)).toString(2).slice(1);
            console.log(str0+str1);
        }
        bufBit += pair[1];              // calculate position of pair[0]'s LSB
        var idx = (bufBit / 8) >> 0,
            sft = 7 - (bit % 8);
        // NOTE: only need to paste 2 bytes max, `CODES[1].makeup.reduce(function (max,p) { return Math.max(p[1],max); }, 0)` is 13
        var merge = pair[0] << sft;
        buffer[idx] |= merge & 0xFF;
        if (merge >>= 8) {
            buffer[idx-1] |= merge & 0xFF;
            if (merge >>= 8) {      // …however, sft's offset may cause the codeword to overlap a third byte
                buffer[idx-2] |= merge & 0xFF;      
            }
        }
    }
};

try {
    var start = Date.now(),
        result = exports.compress(bitmap, {outputLimit:8});
    console.log("Took", Date.now()-start, "milliseconds");
} catch (e) { console.log(e.stack); }