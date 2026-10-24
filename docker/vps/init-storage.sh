#!/bin/sh
set -eu
mc mb --ignore-existing local/spaceworks-inventory
mc anonymous set none local/spaceworks-inventory
mc version enable local/spaceworks-inventory
# A separate application identity can operate only on the private app bucket.
mc admin user add local swi-app "$S3_APP_PASSWORD" >/dev/null
mc admin policy create local swi-app /bootstrap/storage-policy.json >/dev/null
mc admin policy attach local swi-app --user swi-app >/dev/null
echo 'Private storage bucket and application policy ready.'
