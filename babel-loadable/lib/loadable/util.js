"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.getImportArg = getImportArg;
function getImportArg(callPath) {
  return callPath.get("arguments.0");
}