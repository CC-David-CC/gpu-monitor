"""Share the most recent sanitized station report among all viewers."""
import json
import subprocess
import threading
import time
from concurrent.futures import ThreadPoolExecutor

HOSTS = ('r730', 'llm-49', 'llm-60', 'llm-79')
INTERVAL = 20


def read_host(host):
    try:
        data = subprocess.check_output(
            ['ssh','-T','-o','BatchMode=yes','-o','StrictHostKeyChecking=yes','-o','ConnectTimeout=3',
             host, 'python3 ~/.local/share/webos-services/bin/gpu-probe read'],
            timeout=6, stderr=subprocess.DEVNULL)
        report = json.loads(data)
        if report['version'] != 1 or not 0 <= time.time()-report['sampledAt'] < 45:
            raise ValueError('expired')
        return {'host':host, 'available':True, 'sampledAt':report['sampledAt'], 'devices':report['devices']}
    except (OSError, subprocess.SubprocessError, KeyError, ValueError, TypeError):
        return {'host':host,'available':False,'sampledAt':None,'devices':[]}


class FleetCache:
    def __init__(self, queue_counts, read=read_host):
        self.queue_counts = queue_counts
        self.read = read
        self.lock = threading.Lock()
        self.latest = None
        self.expires = 0

    def snapshot(self):
        with self.lock:
            if time.monotonic() >= self.expires:
                with ThreadPoolExecutor(max_workers=len(HOSTS)) as pool:
                    hosts = list(pool.map(self.read, HOSTS))
                self.latest = {'hosts':hosts,'queue':self.queue_counts(),'asOf':int(time.time()),
                               'refreshSeconds':INTERVAL}
                self.expires = time.monotonic()+INTERVAL
            return self.latest
