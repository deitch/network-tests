#!/bin/bash

set -e

COMMON=$(dirname "${BASH_SOURCE[0]}")/../common
. $COMMON/getoption

# do we already have etcd?
ETCD=/usr/local/bin/etcd
ETCDCTL=/usr/local/bin/etcdctl
if [[ ! -e $ETCD || ! -e $ETCDCTL ]]; then
	RELEASE=etcd-v2.3.6-linux-amd64
	curl -L  https://github.com/coreos/etcd/releases/download/v2.3.6/$RELEASE.tar.gz -o $RELEASE.tar.gz
	tar xzvf $RELEASE.tar.gz
	cp $RELEASE/etcd $ETCD
	cp $RELEASE/etcdctl $ETCDCTL
	chmod +x $ETCD $ETCDCTL
fi

nic=team0
# get our management IP
HOSTNAME=$(hostname)
mgmt=$(ip addr show $nic | awk '/10\.[0-9]+\.[0-9]+\.[0-9]+\/[0-9]+/ {print $2}')
mgmt=${mgmt%%/*}

# make sure no existing etcd is running
pkill -x etcd || true
/bin/rm -rf /tmp/data.etcd
CMD="etcd --data-dir /tmp/data.etcd --listen-peer-urls http://0.0.0.0:2380 --initial-cluster $HOSTNAME=http://$mgmt:2380,$PEERNAME=http://$PEER:2380 --name $HOSTNAME --initial-advertise-peer-urls http://$mgmt:2380 --initial-cluster-state new"
nohup $CMD > /tmp/etcd.out 2>&1 &

pgrep etcd || true
cat /tmp/etcd.out || true

