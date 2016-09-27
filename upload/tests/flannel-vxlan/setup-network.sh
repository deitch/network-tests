#!/bin/bash

set -e

# set up network with private IPs for host 
# for net=bridge, simply put both addresses on lo
# because of port mapping, it will work just fine


IPRANGE=192.168.0.0/16

# open the firewall ports necessary
firewall-cmd --zone=trusted --add-source=$IPRANGE

etcdctl set /coreos.com/network/config '{ "Network": "'$IPRANGE'", "Backend":{"Type":"vxlan"} }'

# remove any old routes
ip ro | awk '/flannel/ {print $1,$2,$3}' | while read line; do 
	ip ro del $line
done


# launch flannel on every host
(flanneld --public-ip $PRIVATEMGMTIP --iface $PRIVATEMGMTIP &)

# restart the docker engine with the right bip
systemctl stop docker

mkdir -p /etc/systemd/system/docker.service.d/
OVERRIDE=/etc/systemd/system/docker.service.d/99-flannel.conf

cat > $OVERRIDE <<EOF
[Service]
EnvironmentFile=/run/flannel/subnet.env
ExecStart=
ExecStart=/usr/bin/docker daemon --cluster-store etcd://127.0.0.1:2379 --cluster-advertise $PRIVATEMGMTIP:0 --bip=\${FLANNEL_SUBNET} --mtu=\${FLANNEL_MTU}
EOF


systemctl daemon-reload
systemctl start docker


