#!/bin/bash

set -e


# remove IOV devices

for i in /sys/class/net/*/device/sriov_numvfs; do
	echo 0 > $i || true
done

systemctl stop network
# give it a few seconds
sleep 5
systemctl start NetworkManager
# give it a few seconds again
sleep 5
systemctl start network
