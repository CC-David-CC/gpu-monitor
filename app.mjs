export function mount(host) {
  const doc = host.document ?? document;
  const element = doc.createElement('section');
  element.className = 'window-content gpu-monitor';
  const root = element.attachShadow({mode:'open'});
  root.innerHTML = `<link rel="stylesheet" href="${new URL('./style.css', import.meta.url)}">
    <main><header><h2>GPU Monitor</h2><small class="stamp"></small></header>
    <p role="status">Reading workers…</p><section aria-label="GPU workers"></section></main>`;
  const status = root.querySelector('[role=status]');
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
    status.textContent = `${data.queue.waiting} queued · ${data.queue.running} running · ${data.queue.uncertain} awaiting worker confirmation`;
    const fragment = doc.createDocumentFragment();
    for (const host of data.hosts) {
      const box = doc.createElement('article'); fragment.append(box);
      add(box,'h3',host.host);
      if (!host.available) { add(box,'p','Worker telemetry unavailable'); continue; }
      if (!host.devices.length) { add(box,'p','No GPUs reported'); continue; }
      const rows = doc.createElement('ul'); box.append(rows);
      for (const gpu of host.devices) {
        const row = doc.createElement('li'); rows.append(row);
        add(row,'strong',gpu.name+' · '+gpu.id);
        add(row,'span',`${gpu.utilization ?? '—'}% GPU · ${gpu.usedMiB ?? '—'} / ${gpu.totalMiB ?? '—'} MiB`);
        if (gpu.totalMiB && gpu.usedMiB != null) {
          const meter = doc.createElement('meter'); meter.max=gpu.totalMiB; meter.value=gpu.usedMiB;
          meter.setAttribute('aria-label', 'GPU memory used'); row.append(doc.createElement('br'),meter);
        }
        const lane = data.queue.workers?.[host.host]?.[gpu.id];
        add(row,'small',lane ? `Worker queue: ${lane.waiting} waiting, ${lane.running} running${lane.uncertain ? ', awaiting confirmation' : ''}` : 'No WebOS queue assigned');
        if (gpu.workloads == null) add(row,'small','Model telemetry unavailable');
        else if (!gpu.workloads.length) add(row,'small','No compute process reported');
        else for (const job of gpu.workloads) add(row,'small',job ? job.model+' · '+(job.precision ?? 'Precision unknown') : 'Compute process · model unknown');
      }
    }
    list.replaceChildren(fragment);
  }
  async function refresh() {
    if (controller.signal.aborted) return;
    try {
      if (!subject || host.storage.signedInSubject() !== subject) {
        list.replaceChildren(); stamp.textContent=''; status.textContent='Sign in to view GPU usage.'; return;
      }
      const ctx = await host.storage.accountFileContext();
      const data = await ctx.files.request('snapshot',{resource:'gpu-monitor'});
      if (controller.signal.aborted) return;
      if (!ctx.valid() || host.storage.signedInSubject() !== subject) {
        list.replaceChildren(); stamp.textContent=''; status.textContent='Session ended.'; return;
      }
      display(data);
    } catch {
      if (controller.signal.aborted) return;
      list.replaceChildren(); stamp.textContent=''; status.textContent='GPU usage unavailable.';
    }
    timer = setTimeout(refresh,20000);
  }
  void refresh();
  return {element,dispose(){controller.abort();clearTimeout(timer);element.remove();}};
}
