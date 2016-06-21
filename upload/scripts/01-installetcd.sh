#!/bin/bash

set -e

# do we already have etcd?
if command -v "etcd" > /dev/null 2>&1; then
	yum update etcd
else 
	yum install -y etcd
fi


TEAMNIC=$(ip route | awk '/default/ {print $5}')
# get our management IP
HOSTNAME=$(hostname)
PRIVATEMGMTIP=$1
PEER=$2
PEERNAME=$3

# clean up anything old
DATA_DIR=/var/lib/etcd/default.etcd
CONF_FILE=/etc/etcd/etcd.conf

# make sure no existing etcd is running
systemctl stop etcd

cat > $CONF_FILE <<EOF
[member]
ETCD_NAME=$HOSTNAME
ETCD_DATA_DIR="$DATA_DIR"
ETCD_LISTEN_PEER_URLS="http://0.0.0.0:2380"
ETCD_LISTEN_CLIENT_URLS="http://0.0.0.0:2379"
#
[cluster]
ETCD_INITIAL_ADVERTISE_PEER_URLS="http://$PRIVATEMGMTIP:2380"
ETCD_INITIAL_CLUSTER="$HOSTNAME=http://$PRIVATEMGMTIP:2380,$PEERNAME=http://$PEER:2380"
ETCD_INITIAL_CLUSTER_STATE="new"
ETCD_ADVERTISE_CLIENT_URLS="http://$PRIVATEMGMTIP:2379"

EOF

# keep a clean backup copy
cp $CONF_FILE $CONF_FILE.clean

systemctl start etcd
