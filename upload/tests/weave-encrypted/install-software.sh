#!/bin/bash

set -e

# do we already have weave?
WEAVE=/usr/local/bin/weave
if [[ ! -e $WEAVE ]]; then
	curl -L git.io/weave -o $WEAVE
	chmod +x $WEAVE
fi

