/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/
/** @packageDocumentation
 * @module Core
 */

import { Node } from "@itwin/presentation-common";

/** @internal */
export interface ColorMap {
  [name: string]: number;
}

const colors: ColorMap = {
  AliceBlue: 0xf0f8ffff,
  AntiqueWhite: 0xfaebd7ff,
  Aqua: 0x00ffffff,
  Aquamarine: 0x7fffd4ff,
  Azure: 0xf0ffffff,
  Beige: 0xf5f5dcff,
  Bisque: 0xffe4c4ff,
  Black: 0x000000ff,
  BlanchedAlmond: 0xffebcdff,
  Blue: 0x0000ffff,
  BlueViolet: 0x8a2be2ff,
  Brown: 0xa52a2aff,
  BurlyWood: 0xdeb887ff,
  CadetBlue: 0x5f9ea0ff,
  Chartreuse: 0x7fff00ff,
  Chocolate: 0xd2691eff,
  Coral: 0xff7f50ff,
  CornflowerBlue: 0x6495edff,
  Cornsilk: 0xfff8dcff,
  Crimson: 0xdc143cff,
  Cyan: 0x00ffffff,
  DarkBlue: 0x00008bff,
  DarkCyan: 0x008b8bff,
  DarkGoldenrod: 0xb8860bff,
  DarkGray: 0xa9a9a9ff,
  DarkGreen: 0x006400ff,
  DarkKhaki: 0xbdb76bff,
  DarkMagenta: 0x8b008bff,
  DarkOliveGreen: 0x556b2fff,
  DarkOrange: 0xff8c00ff,
  DarkOrchid: 0x9932ccff,
  DarkRed: 0x8b0000ff,
  DarkSalmon: 0xe9967aff,
  DarkSeaGreen: 0x8fbc8bff,
  DarkSlateBlue: 0x483d8bff,
  DarkSlateGray: 0x2f4f4fff,
  DarkTurquoise: 0x00ced1ff,
  DarkViolet: 0x9400d3ff,
  DeepPink: 0xff1493ff,
  DeepSkyBlue: 0x00bfffff,
  DimGray: 0x696969ff,
  DodgerBlue: 0x1e90ffff,
  Firebrick: 0xb22222ff,
  FloralWhite: 0xfffaf0ff,
  ForestGreen: 0x228b22ff,
  Fuchsia: 0xff00ffff,
  Gainsboro: 0xdcdcdcff,
  GhostWhite: 0xf8f8ffff,
  Gold: 0xffd700ff,
  Goldenrod: 0xdaa520ff,
  Gray: 0x808080ff,
  Green: 0x008000ff,
  GreenYellow: 0xadff2fff,
  Honeydew: 0xf0fff0ff,
  HotPink: 0xff69b4ff,
  IndianRed: 0xcd5c5cff,
  Indigo: 0x4b0082ff,
  Ivory: 0xfffff0ff,
  Khaki: 0xf0e68cff,
  Lavender: 0xe6e6faff,
  LavenderBlush: 0xfff0f5ff,
  LawnGreen: 0x7cfc00ff,
  LemonChiffon: 0xfffacdff,
  LightBlue: 0xadd8e6ff,
  LightCoral: 0xf08080ff,
  LightCyan: 0xe0ffffff,
  LightGoldenrodYellow: 0xfafad2ff,
  LightGray: 0xd3d3d3ff,
  LightGreen: 0x90ee90ff,
  LightPink: 0xffb6c1ff,
  LightSalmon: 0xffa07aff,
  LightSeaGreen: 0x20b2aaff,
  LightSkyBlue: 0x87cefaff,
  LightSlateGray: 0x778899ff,
  LightSteelBlue: 0xb0c4deff,
  LightYellow: 0xffffe0ff,
  Lime: 0x00ff00ff,
  LimeGreen: 0x32cd32ff,
  Linen: 0xfaf0e6ff,
  Magenta: 0xff00ffff,
  Maroon: 0x800000ff,
  MediumAquamarine: 0x66cdaaff,
  MediumBlue: 0x0000cdff,
  MediumOrchid: 0xba55d3ff,
  MediumPurple: 0x9370dbff,
  MediumSeaGreen: 0x3cb371ff,
  MediumSlateBlue: 0x7b68eeff,
  MediumSpringGreen: 0x00fa9aff,
  MediumTurquoise: 0x48d1ccff,
  MediumVioletRed: 0xc71585ff,
  MidnightBlue: 0x191970ff,
  MintCream: 0xf5fffaff,
  MistyRose: 0xffe4e1ff,
  Moccasin: 0xffe4b5ff,
  NavajoWhite: 0xffdeadff,
  Navy: 0x000080ff,
  OldLace: 0xfdf5e6ff,
  Olive: 0x808000ff,
  OliveDrab: 0x6b8e23ff,
  Orange: 0xffa500ff,
  OrangeRed: 0xff4500ff,
  Orchid: 0xda70d6ff,
  PaleGoldenrod: 0xeee8aaff,
  PaleGreen: 0x98fb98ff,
  PaleTurquoise: 0xafeeeeff,
  PaleVioletRed: 0xdb7093ff,
  PapayaWhip: 0xffefd5ff,
  PeachPuff: 0xffdab9ff,
  Peru: 0xcd853fff,
  Pink: 0xffc0cbff,
  Plum: 0xdda0ddff,
  PowderBlue: 0xb0e0e6ff,
  Purple: 0x800080ff,
  Red: 0xff0000ff,
  RosyBrown: 0xbc8f8fff,
  RoyalBlue: 0x4169e1ff,
  SaddleBrown: 0x8b4513ff,
  Salmon: 0xfa8072ff,
  SandyBrown: 0xf4a460ff,
  SeaGreen: 0x2e8b57ff,
  SeaShell: 0xfff5eeff,
  Sienna: 0xa0522dff,
  Silver: 0xc0c0c0ff,
  SkyBlue: 0x87ceebff,
  SlateBlue: 0x6a5acdff,
  SlateGray: 0x708090ff,
  Snow: 0xfffafaff,
  SpringGreen: 0x00ff7fff,
  SteelBlue: 0x4682b4ff,
  Tan: 0xd2b48cff,
  Teal: 0x008080ff,
  Thistle: 0xd8bfd8ff,
  Tomato: 0xff6347ff,
  Transparent: 0xffffffff,
  Turquoise: 0x40e0d0ff,
  Violet: 0xee82eeff,
  Wheat: 0xf5deb3ff,
  White: 0xffffffff,
  WhiteSmoke: 0xf5f5f5ff,
  Yellow: 0xffff00ff,
  YellowGreen: 0x9acd32ff,
};

/** @internal */
export class StyleHelper {
  public static get availableColors(): ColorMap {
    return colors;
  }

  private static getColor(name: string): number {
    name = name.trim();
    if (name.indexOf("#") === 0 && name.length === 7) return StyleHelper.getColorFromHex(name);
    else if (name.toUpperCase().indexOf("RGB(") === 0) return StyleHelper.getColorFromRGB(name);
    return StyleHelper.getColorFromColorName(name);
  }

  /** Get color number from a named color. @see `colors` map for available names. */
  private static getColorFromColorName(name: string): number {
    if (colors.hasOwnProperty(name)) return colors[name] >>> 8;
    throw new Error("Invalid color name");
  }

  /** Get color number from an RGB format: `rgb(r,g,b)` */
  private static getColorFromRGB(name: string): number {
    name = name.substring(name.indexOf("(") + 1, name.indexOf(")"));
    const components = name.split(",");
    const r: number = Number(components[0]);
    const g: number = Number(components[1]);
    const b: number = Number(components[2]);
    return (r << 16) | (g << 8) | b;
  }

  /** Get color number from HEX format: `#ff3300` */
  private static getColorFromHex(name: string): number {
    name = name.substring(1, 8);
    return parseInt(`0x${name}`, 16);
  }

  public static isBold(node: Partial<Node>): boolean {
    return (node.fontStyle?.indexOf("Bold") ?? -1) !== -1; // eslint-disable-line deprecation/deprecation
  }

  public static isItalic(node: Partial<Node>): boolean {
    return (node.fontStyle?.indexOf("Italic") ?? -1) !== -1; // eslint-disable-line deprecation/deprecation
  }

  // istanbul ignore next
  public static getForeColor(node: Partial<Node>): number | undefined {
    return node.foreColor ? StyleHelper.getColor(node.foreColor) : undefined; // eslint-disable-line deprecation/deprecation
  }

  public static getBackColor(node: Partial<Node>): number | undefined {
    return node.backColor ? StyleHelper.getColor(node.backColor) : undefined; // eslint-disable-line deprecation/deprecation
  }
}
