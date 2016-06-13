#!/bin/bash

set -e

FLANNEL=/usr/local/bin/flanneld

# do we already have flannel?
if [[ ! -e $FLANNEL ]]; then
	RELEASE=flannel-0.5.5
	curl -L https://github.com/coreos/flannel/releases/download/v0.5.5/$RELEASE-linux-amd64.tar.gz -o $RELEASE.tar.gz
	tar xzvf $RELEASE.tar.gz
	cp $RELEASE/flanneld $FLANNEL
	chmod +x $FLANNEL
fi	
