#!/bin/sh

mydir=$PWD

echo "What can i do?"
select task in "Build for MI with preview" "Build for MI" "Static vue components" "Exit"; do
   cd ~/GulpModules
   case $task in
  
       "Build for MI with preview" ) gulp build_with_preview --path=$mydir --gulpfile mi.js; break;;
       "Build for MI" ) gulp build --path=$mydir --gulpfile mi.js; break;;
        "InDesign -> .vue" ) gulp vue_components --path=$mydir --gulpfile id_to_vue.js; break;;
       "Exit" ) echo "Goodbye!"; exit;;
   esac
done
