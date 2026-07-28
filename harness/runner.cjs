// Plain CJS runner: sets up jsdom globals, then loads the bundled harness.
const { JSDOM } = require("jsdom");
const dom = new JSDOM("<!DOCTYPE html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "https://localhost/"
});
const { window } = dom;
global.window = window;
global.document = window.document;
global.navigator = window.navigator;
global.SVGElement = window.SVGElement;
global.Element = window.Element;
global.HTMLElement = window.HTMLElement;
global.MouseEvent = window.MouseEvent;
global.KeyboardEvent = window.KeyboardEvent;
global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
// jsdom lacks layout: stub getBBox / getScreenCTM on SVG elements.
const proto = window.SVGElement.prototype;
proto.getBBox = proto.getBBox || function () {
    return { x: 0, y: 0, width: 110, height: 24 };
};
proto.getScreenCTM = proto.getScreenCTM || (() => null);
require("../.tmp/harness.bundle.js");
