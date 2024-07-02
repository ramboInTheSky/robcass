"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = requireAsyncProperty;
function requireAsyncProperty({
  types: t
}) {
  return () => t.objectProperty(t.identifier("resolved"), t.objectExpression([]));
}