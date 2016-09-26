#!/bin/bash

set -e

# do we already have weave?
WEAVE=/usr/local/bin/weave
if [[ ! -e $WEAVE ]]; then
	# because of the tx=off rx=off bug, we have to use the latest snapshot that fixed this
	# see https://github.com/weaveworks/weave/issues/2354
	# now this one is fixed as of 1.6.0
	curl -L https://github.com/weaveworks/weave/releases/download/v1.6.2/weave -o $WEAVE
	chmod +x $WEAVE
fi

