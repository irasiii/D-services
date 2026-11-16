import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import {
  api, money, PLACES, VEHICLE_CLASSES,
  type Charge, type Customer, type Job, type Provider, type Quote, type Service, type Summary, type VehicleClass,
} from './api';

type Tab = 'customer' | 'provider' | 'company';
type Run = (action: () => Promise<unknown>) => Promise<void>;

const Tag = ({ value }: { value: string }) => <span className={`tag ${value}`}>{value.replace('_', ' ')}</span>;

function Table({ head, children, empty }: { head: string[]; children: ReactNode[]; empty: string }) {
  if (children.length === 0) return <p className="muted">{empty}</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{head.map((h) => <th key={h} className={/price|fee|payout|paid/i.test(h) ? 'num' : ''}>{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function App() {
  const [tab, setTab] = useState<Tab>('customer');
  const [error, setError] = useState('');
  const [version, setVersion] = useState(0); // bump to make every view reload

  const run: Run = useCallback(async (action) => {
    setError('');
    try {
      await action();
      setVersion((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  return (
    <>
      <header>
        <h1><span>D-services</span> Courier</h1>
        <nav role="tablist">
          {(['customer', 'provider', 'company'] as const).map((t) => (
            <button key={t} role="tab" aria-selected={tab === t} onClick={() => { setTab(t); setError(''); }}>
              {t === 'customer' ? 'Send a parcel' : t === 'provider' ? 'Drive' : 'Company'}
            </button>
          ))}
        </nav>
      </header>
      <main>
        {error && <div className="error" role="alert">{error}</div>}
        {tab === 'customer' && <CustomerView run={run} version={version} />}
        {tab === 'provider' && <ProviderView run={run} version={version} />}
        {tab === 'company' && <CompanyView run={run} version={version} />}
      </main>
    </>
  );
}

/** Loads data when the view opens and after every successful action. */
function useLoad<T>(loader: () => Promise<T>, deps: unknown[], run: Run): T | undefined {
  const [data, setData] = useState<T>();
  useEffect(() => {
    let live = true;
    loader().then((d) => live && setData(d)).catch((e) => run(() => Promise.reject(e)));
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return data;
}

function CustomerView({ run, version }: { run: Run; version: number }) {
  const customers = useLoad(api.customers, [version], run) ?? [];
  const [customerId, setCustomerId] = useState('');
  const current = customers.find((c) => c.id === customerId) ?? customers[0];
  const jobs = useLoad(() => (current ? api.jobs({ customerId: current.id }) : Promise.resolve([])), [version, current?.id], run) ?? [];

  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(5);
  const [vehicleClass, setVehicleClass] = useState<VehicleClass>('CAR');
  const [description, setDescription] = useState('');
  const [quote, setQuote] = useState<Quote>();

  useEffect(() => {
    let live = true;
    setQuote(undefined);
    if (from !== to) api.quote(PLACES[from]!, PLACES[to]!, vehicleClass).then((q) => live && setQuote(q)).catch(() => undefined);
    return () => { live = false; };
  }, [from, to, vehicleClass]);

  const register = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const form = e.currentTarget;
    void run(async () => {
      const c = await api.createCustomer({ name: String(f.get('name')), email: String(f.get('email')) });
      setCustomerId(c.id);
      form.reset();
    });
  };

  const book = (e: FormEvent) => {
    e.preventDefault();
    if (!current) return;
    void run(async () => {
      await api.createJob({ customerId: current.id, description, pickup: PLACES[from]!, dropoff: PLACES[to]!, vehicleClass });
      setDescription('');
    });
  };

  return (
    <>
      <section>
        <h2>Your account</h2>
        <div className="row">
          <label>Signed in as
            <select value={current?.id ?? ''} onChange={(e) => setCustomerId(e.target.value)} disabled={customers.length === 0}>
              {customers.length === 0 && <option value="">No customers yet — register below</option>}
              {customers.map((c: Customer) => <option key={c.id} value={c.id}>{c.name} ({c.email})</option>)}
            </select>
          </label>
        </div>
        <form onSubmit={register} style={{ marginTop: 12 }}>
          <label>Name<input name="name" required maxLength={200} /></label>
          <label>Email<input name="email" type="email" required /></label>
          <button className="primary ghost">Register</button>
        </form>
      </section>

      <section>
        <h2>Send a parcel</h2>
        <form onSubmit={book}>
          <label>Pick up from
            <select value={from} onChange={(e) => setFrom(Number(e.target.value))}>
              {PLACES.map((p, i) => <option key={p.address} value={i}>{p.address}</option>)}
            </select>
          </label>
          <label>Deliver to
            <select value={to} onChange={(e) => setTo(Number(e.target.value))}>
              {PLACES.map((p, i) => <option key={p.address} value={i}>{p.address}</option>)}
            </select>
          </label>
          <label>Vehicle needed
            <select value={vehicleClass} onChange={(e) => setVehicleClass(e.target.value as VehicleClass)}>
              {VEHICLE_CLASSES.map((v) => <option key={v} value={v}>{v.replace('_', ' ')}</option>)}
            </select>
          </label>
          <label style={{ flexBasis: '100%' }}>What are you sending?
            <input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} placeholder="e.g. two boxes, 10 kg" />
          </label>
          <div style={{ flex: '1 1 200px' }}>
            {from === to ? <span className="muted">Choose two different places</span>
              : quote ? <><span className="quote">{money(quote.priceCents)}</span> <span className="muted">for {quote.distanceKm} km</span></>
              : <span className="muted">Getting price…</span>}
          </div>
          <button className="primary" disabled={!current || from === to || !quote}>Book delivery</button>
        </form>
      </section>

      <section>
        <h2>Your deliveries</h2>
        <Table head={['From', 'To', 'Vehicle', 'Status', 'Price', '']} empty="No deliveries yet.">
          {jobs.map((j: Job) => (
            <tr key={j.id}>
              <td>{j.pickupAddress}</td><td>{j.dropoffAddress}</td><td>{j.vehicleClass.replace('_', ' ')}</td>
              <td><Tag value={j.status} /></td>
              <td className="num">{money(j.agreedPriceCents ?? j.quotedPriceCents)}</td>
              <td>{(j.status === 'OPEN' || j.status === 'ASSIGNED') &&
                <button className="small ghost" onClick={() => void run(() => api.jobAction(j.id, 'cancel'))}>Cancel</button>}</td>
            </tr>
          ))}
        </Table>
      </section>
    </>
  );
}

function ProviderView({ run, version }: { run: Run; version: number }) {
  const providers = (useLoad(api.providers, [version], run) ?? []).filter((p) => p.serviceIds?.includes('courier'));
  const [providerId, setProviderId] = useState('');
  const me = providers.find((p) => p.id === providerId) ?? providers[0];
  const open = useLoad(() => api.jobs({ status: 'OPEN' }), [version], run) ?? [];
  const mine = useLoad(() => (me ? api.jobs({ providerId: me.id }) : Promise.resolve([])), [version, me?.id], run) ?? [];
  const charges = useLoad(() => (me ? api.charges({ providerId: me.id }) : Promise.resolve([])), [version, me?.id], run) ?? [];
  const earned = charges.reduce((sum, c) => sum + c.providerPayoutCents, 0);

  const register = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const form = e.currentTarget;
    void run(async () => {
      const p = await api.createProvider({
        name: String(f.get('name')), email: String(f.get('email')), licenceNumber: String(f.get('licenceNumber')),
        licenceClass: String(f.get('licenceClass')), vehicleClass: String(f.get('vehicleClass')) as VehicleClass,
      });
      setProviderId(p.id);
      form.reset();
    });
  };

  return (
    <>
      <section>
        <h2>Your driver account</h2>
        <div className="row">
          <label>Signed in as
            <select value={me?.id ?? ''} onChange={(e) => setProviderId(e.target.value)} disabled={providers.length === 0}>
              {providers.length === 0 && <option value="">No drivers yet — register below</option>}
              {providers.map((p: Provider) => (
                <option key={p.id} value={p.id}>{p.name} — {p.vehicleClasses?.join(', ').replace('_', ' ')} ({p.status})</option>
              ))}
            </select>
          </label>
          {me && <div><Tag value={me.status} /> <span className="muted">Earned so far: </span><b>{money(earned)}</b></div>}
        </div>
        {me?.status === 'PENDING' && <p className="muted">The company must approve your licence and vehicle before you can take jobs (Company tab).</p>}
        <form onSubmit={register} style={{ marginTop: 12 }}>
          <label>Name<input name="name" required /></label>
          <label>Email<input name="email" type="email" required /></label>
          <label>Licence number<input name="licenceNumber" required maxLength={40} /></label>
          <label>Licence class<input name="licenceClass" required maxLength={10} placeholder="C, LR, MR, HR…" /></label>
          <label>Your vehicle
            <select name="vehicleClass" defaultValue="CAR">
              {VEHICLE_CLASSES.map((v) => <option key={v} value={v}>{v.replace('_', ' ')}</option>)}
            </select>
          </label>
          <button className="primary ghost">Register as driver</button>
        </form>
      </section>

      <section>
        <h2>Available jobs</h2>
        <Table head={['From', 'To', 'Distance', 'Vehicle', 'Price', '']} empty="No open jobs right now.">
          {open.map((j: Job) => (
            <tr key={j.id}>
              <td>{j.pickupAddress}</td><td>{j.dropoffAddress}</td><td>{j.distanceKm.toFixed(1)} km</td>
              <td>{j.vehicleClass.replace('_', ' ')}</td><td className="num">{money(j.quotedPriceCents)}</td>
              <td><button className="small" disabled={!me} onClick={() => me && void run(() => api.acceptJob(j.id, me.id))}>Accept</button></td>
            </tr>
          ))}
        </Table>
      </section>

      <section>
        <h2>Your jobs</h2>
        <Table head={['From', 'To', 'Status', 'Price', 'Your payout', '']} empty="You have not taken any jobs yet.">
          {mine.map((j: Job) => {
            const charge = charges.find((c) => c.jobId === j.id);
            return (
              <tr key={j.id}>
                <td>{j.pickupAddress}</td><td>{j.dropoffAddress}</td><td><Tag value={j.status} /></td>
                <td className="num">{money(j.agreedPriceCents)}</td>
                <td className="num">{charge ? money(charge.providerPayoutCents) : '—'}</td>
                <td>
                  {j.status === 'ASSIGNED' && <button className="small" onClick={() => void run(() => api.jobAction(j.id, 'start'))}>Picked up</button>}
                  {j.status === 'IN_PROGRESS' && <button className="small" onClick={() => void run(() => api.jobAction(j.id, 'complete'))}>Delivered</button>}
                </td>
              </tr>
            );
          })}
        </Table>
      </section>
    </>
  );
}

function CompanyView({ run, version }: { run: Run; version: number }) {
  const providers = useLoad(api.providers, [version], run) ?? [];
  const service = useLoad(api.service, [version], run);
  const summary = useLoad(api.summary, [version], run);
  const charges = useLoad(() => api.charges(), [version], run) ?? [];
  const [feeType, setFeeType] = useState<Service['feeType']>('PERCENTAGE');
  const [feeValue, setFeeValue] = useState('15');

  useEffect(() => {
    if (!service) return;
    setFeeType(service.feeType);
    setFeeValue(String(service.feeType === 'PERCENTAGE' ? service.feeBps / 100 : service.feeFixedCents / 100));
  }, [service]);

  const saveFee = (e: FormEvent) => {
    e.preventDefault();
    const n = Number(feeValue);
    void run(() => api.updateFee(feeType === 'PERCENTAGE' ? { type: 'PERCENTAGE', bps: Math.round(n * 100) } : { type: 'FIXED', cents: Math.round(n * 100) }));
  };

  const total: Summary['total'] | undefined = summary?.total;
  return (
    <>
      <section>
        <h2>Revenue (all services)</h2>
        <div className="stats">
          <div className="stat"><span className="muted">Jobs charged</span><b>{total?.jobs ?? 0}</b></div>
          <div className="stat"><span className="muted">Customers paid</span><b>{money(total?.grossCents ?? 0)}</b></div>
          <div className="stat"><span className="muted">Company fees</span><b>{money(total?.platformFeeCents ?? 0)}</b></div>
          <div className="stat"><span className="muted">Paid to providers</span><b>{money(total?.providerPayoutCents ?? 0)}</b></div>
        </div>
      </section>

      <section>
        <h2>Courier fee</h2>
        <form onSubmit={saveFee}>
          <label>Company charges
            <select value={feeType} onChange={(e) => setFeeType(e.target.value as Service['feeType'])}>
              <option value="PERCENTAGE">Percentage of the job price</option>
              <option value="FIXED">Fixed fee per job</option>
            </select>
          </label>
          <label>{feeType === 'PERCENTAGE' ? 'Percent (%)' : 'Amount (AUD)'}
            <input type="number" min="0" max={feeType === 'PERCENTAGE' ? 100 : undefined} step="0.01" value={feeValue} onChange={(e) => setFeeValue(e.target.value)} required />
          </label>
          <button className="primary">Save fee</button>
        </form>
        <p className="muted">Applies to jobs completed from now on. Earlier charges keep the fee they were made with.</p>
      </section>

      <section>
        <h2>Providers</h2>
        <Table head={['Name', 'Licence', 'Vehicles', 'Services', 'Status', '']} empty="No providers have registered yet.">
          {providers.map((p: Provider) => (
            <tr key={p.id}>
              <td>{p.name}<br /><span className="muted">{p.email}</span></td>
              <td>{p.licenceNumber} ({p.licenceClass})</td>
              <td>{p.vehicleClasses?.join(', ').replaceAll('_', ' ')}</td>
              <td>{p.serviceIds?.join(', ')}</td>
              <td><Tag value={p.status} /></td>
              <td>
                {p.status !== 'APPROVED' && <button className="small" onClick={() => void run(() => api.setProviderStatus(p.id, 'approve'))}>Approve</button>}
                {p.status === 'APPROVED' && <button className="small ghost" onClick={() => void run(() => api.setProviderStatus(p.id, 'suspend'))}>Suspend</button>}
              </td>
            </tr>
          ))}
        </Table>
      </section>

      <section>
        <h2>Charges</h2>
        <Table head={['Date', 'Service', 'Customer paid', 'Company fee', 'Provider payout', 'Status', '']} empty="No charges yet. A charge is created when a job is delivered.">
          {charges.map((c: Charge) => (
            <tr key={c.id}>
              <td>{new Date(c.createdAt).toLocaleString('en-AU', { dateStyle: 'medium', timeStyle: 'short' })}</td>
              <td>{c.serviceTypeId}</td>
              <td className="num">{money(c.grossCents)}</td><td className="num">{money(c.platformFeeCents)}</td>
              <td className="num">{money(c.providerPayoutCents)}</td><td><Tag value={c.status} /></td>
              <td>{c.status === 'PENDING' && <button className="small ghost" onClick={() => void run(() => api.markPaid(c.id))}>Mark paid</button>}</td>
            </tr>
          ))}
        </Table>
      </section>
    </>
  );
}
