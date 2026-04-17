'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Save, RefreshCw, Trash2, Plus, Loader2 } from 'lucide-react';
import { getSocket } from '@/lib/socket';
import { cn } from '@/lib/utils';

// Alle configureerbare .env sleutels gegroepeerd
const CONFIG_GROUPS = [
  {
    title:       'Swap Instellingen',
    description: 'Bedragen en fees per trade',
    fields: [
      { key: 'BUY_AMOUNT_SOL',              label: 'Koop-bedrag (SOL)',         type: 'number' },
      { key: 'SLIPPAGE_BPS',                label: 'Slippage (bps)',            type: 'number' },
      { key: 'PRIORITY_FEE_MICRO_LAMPORTS', label: 'Priority Fee (µLamports)', type: 'number' },
    ],
  },
  {
    title:       'Take Profit / Stop Loss',
    description: 'Exit-criteria voor posities',
    fields: [
      { key: 'TAKE_PROFIT_PERCENT',  label: 'Take Profit (%)',       type: 'number' },
      { key: 'STOP_LOSS_PERCENT',    label: 'Stop Loss (%)',         type: 'number' },
      { key: 'MONITOR_INTERVAL_MS',  label: 'Monitor interval (ms)', type: 'number' },
    ],
  },
  {
    title:       'Filter Criteria',
    description: 'Pool-acceptatiedrempels',
    fields: [
      { key: 'MIN_LIQUIDITY_SOL',      label: 'Min. liquiditeit (SOL)',     type: 'number' },
      { key: 'MAX_TOKEN_AGE_MS',        label: 'Max. token leeftijd (ms)',   type: 'number' },
      { key: 'MIN_DEPLOYER_TX_COUNT',   label: 'Min. deployer transacties', type: 'number' },
      { key: 'HONEYPOT_MAX_LOSS_PCT',   label: 'Max. honeypot verlies (%)', type: 'number' },
      { key: 'HONEYPOT_CHECK_ENABLED',  label: 'Honeypot check (true/false)', type: 'text' },
    ],
  },
];

type SaveState = 'idle' | 'saving' | 'ok' | 'error';

export default function SettingsPage() {
  const [values,     setValues]     = useState<Record<string, string>>({});
  const [saveState,  setSaveState]  = useState<Record<string, SaveState>>({});
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({});
  const [loading,    setLoading]    = useState(true);
  const [saveAllState, setSaveAllState] = useState<'idle' | 'saving' | 'ok' | 'error'>('idle');
  const [saveAllError, setSaveAllError] = useState('');

  const [newAddress, setNewAddress] = useState('');
  const [newReason,  setNewReason]  = useState('');
  const [blacklist,  setBlacklist]  = useState<Array<{ address: string; reason: string }>>([]);

  // ── Laad huidige .env waarden bij opstarten ─────────────────────────────────
  useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((data: Record<string, string>) => {
        setValues(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error('Kon instellingen niet laden:', err);
        setLoading(false);
      });
  }, []);

  function updateField(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setSaveState((prev) => ({ ...prev, [key]: 'idle' }));
    setSaveErrors((prev) => ({ ...prev, [key]: '' }));
  }

  // ── Sla één veld op ─────────────────────────────────────────────────────────
  const saveField = useCallback(async (key: string) => {
    setSaveState((prev) => ({ ...prev, [key]: 'saving' }));
    setSaveErrors((prev) => ({ ...prev, [key]: '' }));

    try {
      const res = await fetch('/api/settings', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ key, value: values[key] ?? '' }),
      });

      if (res.ok) {
        setSaveState((prev) => ({ ...prev, [key]: 'ok' }));
        // Stuur ook via socket zodat bot de waarde direct pakt
        getSocket().emit('update_config', { key, value: values[key] ?? '' });
        setTimeout(() => setSaveState((prev) => ({ ...prev, [key]: 'idle' })), 2500);
      } else {
        const body = await res.json() as { error?: string };
        setSaveErrors((prev) => ({ ...prev, [key]: body.error ?? 'Onbekende fout' }));
        setSaveState((prev) => ({ ...prev, [key]: 'error' }));
      }
    } catch {
      setSaveErrors((prev) => ({ ...prev, [key]: 'Netwerkfout' }));
      setSaveState((prev) => ({ ...prev, [key]: 'error' }));
    }
  }, [values]);

  // ── Sla alle gewijzigde velden tegelijk op ──────────────────────────────────
  async function saveAll() {
    const updates = Object.entries(values).map(([key, value]) => ({ key, value }));
    if (updates.length === 0) return;

    setSaveAllState('saving');
    setSaveAllError('');

    try {
      const res = await fetch('/api/settings', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ updates }),
      });

      if (res.ok) {
        setSaveAllState('ok');
        // Stuur alle waarden via socket
        updates.forEach(({ key, value }) =>
          getSocket().emit('update_config', { key, value })
        );
        setTimeout(() => setSaveAllState('idle'), 2500);
      } else {
        const body = await res.json() as { error?: string };
        setSaveAllError(body.error ?? 'Onbekende fout');
        setSaveAllState('error');
      }
    } catch {
      setSaveAllError('Netwerkfout bij opslaan');
      setSaveAllState('error');
    }
  }

  function addToBlacklist() {
    if (!newAddress.trim()) return;
    setBlacklist((prev) => [
      ...prev,
      { address: newAddress.trim(), reason: newReason.trim() || 'Handmatig toegevoegd' },
    ]);
    getSocket().emit('update_config', {
      key:   'BLACKLIST_ADD',
      value: JSON.stringify({ address: newAddress.trim(), reason: newReason.trim() }),
    });
    setNewAddress('');
    setNewReason('');
  }

  function removeFromBlacklist(address: string) {
    setBlacklist((prev) => prev.filter((e) => e.address !== address));
    getSocket().emit('update_config', { key: 'BLACKLIST_REMOVE', value: address });
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Instellingen</h1>
          <p className="text-sm text-muted-foreground">
            {loading ? 'Laden…' : 'Bot configuratie en blacklist beheer'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saveAllState === 'error' && (
            <span className="text-xs text-red-500">{saveAllError}</span>
          )}
          <Button onClick={saveAll} size="sm" disabled={loading || saveAllState === 'saving'}>
            {saveAllState === 'saving' ? (
              <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Opslaan…</>
            ) : saveAllState === 'ok' ? (
              <span className="text-green-500">Opgeslagen ✓</span>
            ) : (
              <><Save className="mr-1.5 h-3.5 w-3.5" /> Alles opslaan</>
            )}
          </Button>
        </div>
      </div>

      {CONFIG_GROUPS.map((group) => (
        <Card key={group.title}>
          <CardHeader>
            <CardTitle className="text-base">{group.title}</CardTitle>
            <CardDescription>{group.description}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {group.fields.map(({ key, label, type }) => {
                const state = saveState[key] ?? 'idle';
                const err   = saveErrors[key];
                return (
                  <div key={key} className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">{label}</Label>
                    <div className="flex gap-2">
                      <Input
                        type={type}
                        placeholder={loading ? 'Laden…' : key}
                        value={values[key] ?? ''}
                        onChange={(e) => updateField(key, e.target.value)}
                        disabled={loading}
                        className="h-8 text-sm font-mono"
                      />
                      <Button
                        size="sm"
                        variant={state === 'ok' ? 'secondary' : 'outline'}
                        onClick={() => saveField(key)}
                        disabled={loading || state === 'saving'}
                        className={cn(
                          'h-8 shrink-0 min-w-[2.25rem]',
                          state === 'ok'    && 'text-green-500',
                          state === 'error' && 'border-red-500 text-red-500',
                        )}
                      >
                        {state === 'saving' ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : state === 'ok' ? (
                          '✓'
                        ) : state === 'error' ? (
                          '✕'
                        ) : (
                          <Save className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                    {err && (
                      <p className="text-xs text-red-500">{err}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Blacklist beheer */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Blacklist Beheer</CardTitle>
          <CardDescription>
            Deployer-wallets en token-mints die automatisch worden geblokkeerd
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Adres (base58)"
              value={newAddress}
              onChange={(e) => setNewAddress(e.target.value)}
              className="h-8 flex-1 font-mono text-xs"
            />
            <Input
              placeholder="Reden (optioneel)"
              value={newReason}
              onChange={(e) => setNewReason(e.target.value)}
              className="h-8 flex-1 text-sm"
            />
            <Button size="sm" onClick={addToBlacklist} className="h-8 shrink-0">
              <Plus className="mr-1 h-3.5 w-3.5" /> Toevoegen
            </Button>
          </div>

          <Separator />

          {blacklist.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Geen lokaal toegevoegde adressen. De bot laadt{' '}
              <code className="rounded bg-muted px-1 text-xs">src/blacklist.json</code>{' '}
              bij opstart.
            </p>
          ) : (
            <div className="space-y-2">
              {blacklist.map(({ address, reason }) => (
                <div
                  key={address}
                  className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2"
                >
                  <div>
                    <p className="font-mono text-xs">{address}</p>
                    <p className="text-xs text-muted-foreground">{reason}</p>
                  </div>
                  <Button
                    size="icon" variant="ghost"
                    onClick={() => removeFromBlacklist(address)}
                    className="h-7 w-7 text-red-500 hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bot herstarten */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Bot Beheer</CardTitle>
        </CardHeader>
        <CardContent>
          <Button
            variant="outline"
            onClick={() => {
              getSocket().emit('stop_bot');
              setTimeout(() => getSocket().emit('start_bot'), 1000);
            }}
          >
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Bot herstarten
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
