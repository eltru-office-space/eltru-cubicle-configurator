// Unambiguous uppercase chars: no 0, O, I, 1
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateConfigCode() {
  let code = 'ELT-';
  for (let i = 0; i < 4; i++) {
    code += CHARSET[Math.floor(Math.random() * CHARSET.length)];
  }
  return code;
}

module.exports = { generateConfigCode };
