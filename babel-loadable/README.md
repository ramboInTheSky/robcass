# @next/babel-plugin-loadable-manifest

This package contains a plugin for our Babel build system, which is aimed at reducing boilerplate code relating to our dynamic "loadable components" - the technical basis for the templating system in Next applications.

## Concept

This plugin relies on the transformations done by the `@loadable` [Babel plugin](https://loadable-components.com/docs/babel-plugin/). Diving into the technical implementation of this plugin, there is a transformation of every dynamic import `() => import("./foo")` call preceded by their magic comment `/* #__LOADABLE__ */`.

This transformation takes what would usually be handled by their `loadable()` function and creates a variable, which can be interacted with and transformed in it's own way.

Using this feature, we initially had a series of components selected by the template using a manifest in a structure like below

```
 |- index.ts
 |- manifest.ts
 |- templates/
 |--- standard.ts
 |--- cotton22.ts
```

where `manifest.ts` would look like

```
import {STANDARD_TEMPLATE, COTTON_22_TEMPLATE} from "path/to/constants.ts"

export const MANIFEST: Components = {
    [COTTON_22_TEMPLATE]: /* #__LOADABLE__ */ () => import(/* webpackChunkName: "cotton22-plp" */ "./templates/cotton22"),
    [STANDARD_TEMPLATE]: /* #__LOADABLE__ */ () => import(/* webpackChunkName: "standard-plp" */ "./templates/standard"),
}
```

This would work great, but when there are multiple components interacting with the same template names we can reduce boilerplate code by dynamically inserting this code using a pre-defined signature - and this is what Babel transformations are made for.

By defining `@manifest/*` as the signature to look for, we can use Babel to totally replace this import with an inline declaration of the variable `MANIFEST`, the actual code of which can be interpreted through the characters after the `/` in the import line (to allow for a dynamic `webpackChunkName`).

Further to this, by reading the `@manifest/constants` import (which is ignored and not transformed by this plugin) and replacing the `MANIFEST` object keys with the actual strings defined in the constants file to prevent a potential double import of `@manifest/constants` in a single file.

## Setting up a package for templating

To set up a package for templating you must make Typescript understand the imports

tsconfig.json
```
{
  "compilerOptions": {
    ...
    "paths": {
      "@manifest/constants": ["templating/constants"],
      "@manifest*": ["templating/manifest"]
    }
  }
}
```

Then you can place the manifest object in `./src/templating/manifest.ts` (following the same structure as other manifest files - consider that it also requires `./src/templating/constants.ts`)

Webpack must also be made to understand the constants import because it isn't transformed by the babel plugin. This is already done in our main client and server webpack config using

```
resolve: {
    alias: {
        "@manifest/constants": paths.templatingConstants, // Path to `./templating/constants.ts` for each project
    },
},
```

Jest also needs to be setup to understand the constants file, this is already setup in the root using

jest.config.ts
```
moduleNameMapper: {
    "^@manifest/constants$": `<rootDir>/templating/constants`,
}
```

## Guidance for editing

 - Anything in the `./loadable` folder is from the loadable [babel plugin repo](https://github.com/gregberge/loadable-components/tree/main/packages/babel-plugin). Any updates to `@loadable` package should consider potential updates to the babel plugin should be brought into this package
 - There is a lot of expectation for the manifest and constants file to exist once a `@manifest/*` import is found, this could be improved with better errors
 - Manifest files are expected to have the pattern `export const MANIFEST: Components = {` in the file to discover the first line of the object definition, this shouldn't be changed and editing the manifest file should mainly stick to changes to the **object key/values** and the **constants imports**. Object key/value lines are also expected to have whitespace preceding the first character (i.e proper 4 space/tab formatting). This should be improved.