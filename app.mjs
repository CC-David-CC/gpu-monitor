export function mount(host) {
  const doc = host.document ?? document;
  const element = doc.createElement('section');
  element.className = 'window-content gpu-monitor';
  const root = element.attachShadow({mode:'open'});
  root.innerHTML = `<link rel="stylesheet" href="${new URL('./style.css', import.meta.url)}">
    <main><header><h2>Compute queue</h2><small class="stamp"></small></header>
    <p role="status">Reading workers…</p><dl class="queue" hidden></dl><nav aria-label="GPU hosts" hidden></nav><section aria-label="GPU workers"></section></main>`;
  const status = root.querySelector('[role=status]');
  const queue = root.querySelector('.queue');
  const navigation = root.querySelector('nav');
  const main = root.querySelector('main');
  const stamp = root.querySelector('.stamp');
  const list = root.querySelector('[aria-label="GPU workers"]');
  const controller = new AbortController();
  const subject = host.storage?.signedInSubject?.();
  let timer;
  const add = (parent, tag, text) => {
    const node = doc.createElement(tag); node.textContent = text; parent.append(node); return node;
  };
  function display(data) {
    stamp.textContent = 'Updated ' + new Date(data.asOf * 1000).toLocaleTimeString();
    status.hidden = true;
    queue.hidden = false;
    queue.replaceChildren();
    for (const [label, count] of [['Queued', data.queue.waiting], ['Running', data.queue.running], ['Awaiting confirmation', data.queue.uncertain]]) {
      const cell = doc.createElement('div');
      add(cell, 'dt', label);
      add(cell, 'dd', count);
      queue.append(cell);
    }
    const buttons = new Map([...navigation.children].map(button => [button.dataset.host, button]));
    navigation.hidden = !data.hosts.length;
    const fragment = doc.createDocumentFragment();
    for (const machine of data.hosts) {
      // Raphael is the Ryzen display adapter on these workers.
      const devices = (machine.devices ?? []).filter(gpu => gpu.name !== 'Raphael');
      const box = doc.createElement('article');
      box.dataset.host = machine.host;
      fragment.append(box);
      let button = buttons.get(machine.host);
      if (!button) {
        button = doc.createElement('button');
        button.type = 'button';
        button.dataset.host = machine.host;
        button.addEventListener('click', () => {
          const panel = [...list.children].find(item => item.dataset.host === machine.host);
          if (panel) {
            main.scrollTop += panel.getBoundingClientRect().top - main.getBoundingClientRect().top - 8;
            panel.focus({preventScroll:true});
          }
        });
        navigation.append(button);
      }
      buttons.delete(machine.host);
      button.textContent = machine.host + ' · ' + (machine.available ? devices.length + (devices.length === 1 ? ' GPU' : ' GPUs') : 'unavailable');
      box.tabIndex = -1;
      box.setAttribute('aria-label', machine.host);
      const heading = doc.createElement('header');
      box.append(heading);
      add(heading, 'h3', machine.host);
      if (!machine.available) { add(box, 'p', 'Worker telemetry unavailable'); continue; }
      add(heading, 'small', devices.length + (devices.length === 1 ? ' GPU' : ' GPUs'));
      if (!devices.length) { add(box, 'p', 'No worker GPUs reported'); continue; }
      const rows = doc.createElement('ul');
      box.append(rows);
      for (const gpu of devices) {
        const row = doc.createElement('li');
        rows.append(row);
        const identity = doc.createElement('div');
        row.append(identity);
        add(identity, 'strong', gpu.name);
        add(identity, 'small', gpu.id);
        const metrics = doc.createElement('div');
        metrics.className = 'metrics';
        row.append(metrics);
        add(metrics, 'span', gpu.utilization == null ? 'Load unavailable' : gpu.utilization + '% load');
        if (gpu.totalMiB && gpu.usedMiB != null) {
          const meter = doc.createElement('meter');
          meter.max = gpu.totalMiB;
          meter.value = gpu.usedMiB;
          meter.setAttribute('aria-label', 'GPU memory used');
          metrics.append(meter);
          add(metrics, 'small', gpu.usedMiB.toLocaleString() + ' / ' + gpu.totalMiB.toLocaleString() + ' MiB');
        } else add(metrics, 'small', 'Memory unavailable');
        const workload = doc.createElement('div');
        workload.className = 'workload';
        row.append(workload);
        if (gpu.workloads == null) add(workload, 'span', 'Model status unknown');
        else if (!gpu.workloads.length) add(workload, 'span', 'No compute process reported');
        else for (const job of gpu.workloads) add(workload, 'span', job ? job.model + ' · ' + (job.precision ?? 'Precision unknown') : 'Compute process · model unknown');
        const lane = data.queue.workers?.[machine.host]?.[gpu.id];
        if (lane) add(workload, 'strong', 'Queue: ' + lane.waiting + ' waiting · ' + lane.running + ' running' + (lane.uncertain ? ' · awaiting confirmation' : ''));
      }
    }
    for (const old of buttons.values()) old.remove();
    list.replaceChildren(fragment);
  }
  function message(text) {
    list.replaceChildren();
    queue.hidden = true;
    navigation.hidden = true;
    stamp.textContent = '';
    status.hidden = false;
    status.textContent = text;
  }
  async function refresh() {
    if (controller.signal.aborted) return;
    try {
      if (!subject || host.storage.signedInSubject() !== subject) {
        message('Sign in to view GPU usage.'); return;
      }
      const ctx = await host.storage.accountFileContext();
      const data = await ctx.files.request('snapshot',{resource:'gpu-monitor'});
      if (controller.signal.aborted) return;
      if (!ctx.valid() || host.storage.signedInSubject() !== subject) {
        message('Session ended.'); return;
      }
      display(data);
    } catch {
      if (controller.signal.aborted) return;
      message('GPU usage unavailable.');
    }
    timer = setTimeout(refresh,20000);
  }
  void refresh();
  return {element,dispose(){controller.abort();clearTimeout(timer);element.remove();}};
}
