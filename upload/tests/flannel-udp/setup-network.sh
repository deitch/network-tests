#!/bin/bash

set -e

# set up network with private IPs for host 
# for net=bridge, simply put both addresses on lo
# because of port mapping, it will work just fine


COMMON=$(dirname "${BASH_SOURCE[0]}")/../../common
. $COMMON/getoption

IPRANGE=192.168.0.0/16

# open the firewall ports necessary
firewall-cmd --zone=trusted --add-source=$IPRANGE

etcdctl set /coreos.com/network/config '{ "Network": "'$IPRANGE'", "Backend":{"Type":"udp"} }'


# launch flannel on every host
(flanneld &)

# restart the docker engine with the right bip
systemctl stop docker

mkdir -p /etc/systemd/system/docker.service.d/
OVERRIDE=/etc/systemd/system/docker.service.d/override.conf

cat > $OVERRIDE <<EOF
[Service]
EnvironmentFile=/run/flannel/subnet.env
ExecStart=
ExecStart=/usr/bin/docker daemon --cluster-store etcd://127.0.0.1:2379 --bip=\${FLANNEL_SUBNET} --mtu=\${FLANNEL_MTU}  -H fd://
EOF

systemctl daemon-reload
systemctl start docker


