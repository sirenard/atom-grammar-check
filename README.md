# atom-grammar-check

This atom plugin highlights the syntax and spell mistakes in your editor.

![Small illustration](ressources/demo.png)

## Features:

* Highlight mistakes
* Suggest replacing text
* Support excluded range (stolen from [spell-check](https://github.com/atom/spell-check) module)

## Correcter modules

There is 2 modules implemented:

1. **ginger** that work online (using gingerbread library)
2. **languagetool** that can work online and offline and support more than 20 languages. Due to the big amount of
   requests, it's recommended to have a local server.

## Languagetool support

If you use a local languagetool server (see [here](https://dev.languagetool.org/http-server.html) to install your own),
you can give in option a command line that will be executed when the package is activated to try to start the server.

You can add in package option *Language Tool Stop Server Command* a command that shut down the server when the package is disabled.

## ToDO:

* Optimization?
* Take in account the file type (do not correct some givens file types)
* On/Off toggle