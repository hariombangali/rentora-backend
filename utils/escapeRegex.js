// utils/escapeRegex.js
export function escapeRegex(str) {
  // Escapes regex metacharacters so user input is safe to embed in a RegExp
  // Equivalent to MDN's RegExp.escape behavior
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}