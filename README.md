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

Be careful, when atom is closed, the server is not shut downed, thus it steels use about 700 MiB of memory.

## ToDO:

* Optimization?
* Take in account the file type (do not correct some givens file types)
* On/Off toggle
* Smart shutdown of languagetool server
