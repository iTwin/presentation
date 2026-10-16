/*---------------------------------------------------------------------------------------------
 * Copyright (c) Bentley Systems, Incorporated. All rights reserved.
 * See LICENSE.md in the project root for license terms and full copyright notice.
 *--------------------------------------------------------------------------------------------*/

// Required so the learning-snippet examples can import `@stratakit/icons/*.svg` as asset URLs (the same way
// the delivered StrataKit components do). `@stratakit/icons` ships no type declarations for its `.svg` files.
declare module "*.svg" {
  const content: string;
  export default content;
}
