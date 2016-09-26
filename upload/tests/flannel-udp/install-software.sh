#!/bin/bash

set -e

FLANNEL=/usr/local/bin/flanneld

# do we already have flannel?
if [[ ! -e $FLANNEL ]]; then
	VERSION=0.6.2
	RELEASE=flannel-${VERSION}
	curl -L https://github.com/coreos/flannel/releases/download/v${VERSION}/$RELEASE-linux-amd64.tar.gz -o $RELEASE.tar.gz
	tar xzvf $RELEASE.tar.gz
	cp $RELEASE/flanneld $FLANNEL
	chmod +x $FLANNEL
fi	
