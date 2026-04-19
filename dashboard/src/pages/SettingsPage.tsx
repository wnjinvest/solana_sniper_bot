import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Save, RefreshCw, Trash2, Plus, Loader2, Eye, EyeOff, AlertTriangle, Wallet } from 'lucide-react';
import { getSocket } from '@/lib/socket';
import { useBotSocket } from '@/hooks/use-bot-socket';
import { cn } from '@/lib/utils';

const CONFIG_GROUPS = [
  {
    title: 'Swap Instellingen', description: 'Bedragen en fees per trade',
    fields: [
      { key: 'BUY_AMOUNT_SOL',              label: 'Koop-bedrag (SOL)',         type: 'number' },
      { key: 'SLIPPAGE_BPS',                label: 'Slippage (bps)',            type: 'number' },
      { key: 'PRIORITY_FEE_MICRO_LAMPORTS', label: 'Priority Fee (µLamports)', type: 'number' },
    ],
  },
  {
    title: 'Take Profit / Stop Loss', description: 'Exit-criteria voor posities',
    fields: [
      { key: 'TAKE_PROFIT_PERCENT', label: 'Take Profit (%)',       type: 'number' },
      { key: 'STOP_LOSS_PERCENT',   label: 'Stop Loss (%)',         type: 'number' },
      { key: 'MONITOR_INTERVAL_MS', label: 'Monitor interval (ms)', type: 'number' },
    ],
  },
  {
    title: 'Filter Criteria', description: 'Pool-acceptatiedrempels',
    fields: [
      { key: 'MIN_LIQUIDITY_SOL',     label: 'Min. liquiditeit (SOL)',     type: 'number' },
      { key: 'MAX_TOKEN_AGE_MS',      label: 'Max. token leeftijd (ms)',   type: 'number' },
      { key: 'MIN_DEPLOYER_TX_COUNT', label: 'Min. deployer transacties', type: 'number' },
      { key: 'HONEYPOT_MAX_LOSS_PCT', label: 'Max. honeypot verlies (%)', type: 'number' },
      { key: 'HONEYPOT_CHECK_ENABLED',label: 'Honeypot check (true/false)', type: 'text' },
    ],
  },
];

interface ValidationRule { min?: number; max?: number; pattern?: RegExp; message: string; }

const VALIDATION_RULES: Record<string, ValidationRule> = {
  BUY_AMOUNT_SOL:              { min: 0.001, max: 100,        message: 'Moet tussen 0,001 en 100 SOL zijn' },
  SLIPPAGE_BPS:                { min: 1,     max: 10_000,     message: 'Moet tussen 1 en 10.000 bps zijn' },
  PRIORITY_FEE_MICRO_LAMPORTS: { min: 0,     max: 10_000_000, message: 'Moet ≥ 0 zijn' },
  TAKE_PROFIT_PERCENT:         { min: 1,     max: 10_000,     message: 'Moet tussen 1% en 10.000% zijn' },
  STOP_LOSS_PERCENT:           { min: 1,     max: 100,        message: 'Moet tussen 1% en 100% zijn' },
  MONITOR_INTERVAL_MS:         { min: 1_000, max: 60_000,     message: 'Moet tussen 1.000 en 60.000 ms zijn' },
  MIN_LIQUIDITY_SOL:           { min: 0.1,   max: 10_000,     message: 'Moet ≥ 0,1 SOL zijn' },
  MAX_TOKEN_AGE_MS:            { min: 1_000, max: 3_600_000,  message: 'Moet tussen 1.000 en 3.600.000 ms zijn' },
  MIN_DEPLOYER_TX_COUNT:       { min: 0,     max: 1_000,      message: 'Moet tussen 0 en 1.000 zijn' },
  HONEYPOT_MAX_LOSS_PCT:       { min: 1,     max: 100,        message: 'Moet tussen 1% en 100% zijn' },
  HONEYPOT_CHECK_ENABLED:      { pattern: /^(true|false)$/,   message: 'Moet "true" of "false" zijn' },
};

function validateField(key: string, value: string): string | null {
  const rule = VALIDATION_RULES[key];
  if (!rule) return null;
  if (rule.pattern) return rule.pattern.test(value.trim()) ? null : rule.message;
  const num = parseFloat(value);
  if (isNaN(num)) return 'Moet een getal zijn';
  if (rule.min !== undefined && num < rule.min) return rule.message;
  if (rule.max !== undefined && num > rule.max) return rule.message;
  return null;
}

type SaveState = 'idle' | 'saving' | 'ok' | 'error';

export default function SettingsPage() {
  const { walletAddress, balanceSol } = useBotSocket();

  const [values,       setValues]       = useState<Record<string, string>>({});
  const [saveState,    setSaveState]    = useState<Record<string, SaveState>>({});
  const [saveErrors,   setSaveErrors]   = useState<Record<string, string>>({});
  const [loading,      setLoading]      = useState(true);
  const [saveAllState, setSaveAllState] = useState<'idle' | 'saving' | 'ok' | 'error'>('idle');
  const [newAddress,   setNewAddress]   = useState('');
  const [newReason,    setNewReason]    = useState('');
  const [blacklist,    setBlacklist]    = useState<Array<{ address: string; reason: string }>>([]);

  // Wallet private key invoer
  const [privateKey,     setPrivateKey]     = useState('');
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [walletSaveState, setWalletSaveState] = useState<SaveState>('idle');

  // Laad config via socket get_config
  useEffect(() => {
    const s = getSocket();
    const onConfigData = (data: Record<string, string>) => {
      setValues(data);
      setLoading(false);
    };
    s.on('config_data', onConfigData);
    if (s.connected) {
      s.emit('get_config');
    } else {
      s.once('connect', () => s.emit('get_config'));
    }
    return () => { s.off('config_data', onConfigData); };
  }, []);

  function updateField(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setSaveState((prev) => ({ ...prev, [key]: 'idle' }));
    const err = validateField(key, value);
    setSaveErrors((prev) => ({ ...prev, [key]: err ?? '' }));
  }

  const saveField = useCallback((key: string) => {
    const validationError = validateField(key, values[key] ?? '');
    if (validationError) {
      setSaveErrors((prev) => ({ ...prev, [key]: validationError }));
      setSaveState((prev) => ({ ...prev, [key]: 'error' }));
      return;
    }
    setSaveState((prev) => ({ ...prev, [key]: 'saving' }));
    setSaveErrors((prev) => ({ ...prev, [key]: '' }));
    getSocket().emit('update_config', { key, value: values[key] ?? '' });
    setSaveState((prev) => ({ ...prev, [key]: 'ok' }));
    setTimeout(() => setSaveState((prev) => ({ ...prev, [key]: 'idle' })), 2500);
  }, [values]);

  function saveAll() {
    const allKeys = CONFIG_GROUPS.flatMap((g) => g.fields.map((f) => f.key));
    setSaveAllState('saving');
    allKeys.forEach((key) => {
      if (values[key] !== undefined) {
        getSocket().emit('update_config', { key, value: values[key] });
      }
    });
    setSaveAllState('ok');
    setTimeout(() => setSaveAllState('idle'), 2500);
  }

  function savePrivateKey() {
    const key = privateKey.trim();
    if (!key) return;
    if (key.length < 60 || key.length > 100) {
      setWalletSaveState('error');
      setTimeout(() => setWalletSaveState('idle'), 3000);
      return;
    }
    setWalletSaveState('saving');
    getSocket().emit('update_config', { key: 'WALLET_PRIVATE_KEY', value: key });
    setPrivateKey('');
    setWalletSaveState('ok');
    setTimeout(() => setWalletSaveState('idle'), 3000);
  }

  function addToBlacklist() {
    if (!newAddress.trim()) return;
    setBlacklist((prev) => [...prev, { address: newAddress.trim(), reason: newReason.trim() || 'Handmatig toegevoegd' }]);
    getSocket().emit('update_config', { key: 'BLACKLIST_ADD', value: JSON.stringify({ address: newAddress.trim(), reason: newReason.trim() }) });
    setNewAddress(''); setNewReason('');
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
          <p className="text-sm text-muted-foreground">{loading ? 'Laden…' : 'Bot configuratie en blacklist beheer'}</p>
        </div>
        <Button onClick={saveAll} size="sm" disabled={loading || saveAllState === 'saving'}>
          {saveAllState === 'saving' ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> Opslaan…</>
            : saveAllState === 'ok' ? <span className="text-green-500">Opgeslagen ✓</span>
            : <><Save className="mr-1.5 h-3.5 w-3.5" /> Alles opslaan</>}
        </Button>
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
                        className={cn('h-8 shrink-0 min-w-[2.25rem]', state === 'ok' && 'text-green-500', state === 'error' && 'border-red-500 text-red-500')}
                      >
                        {state === 'saving' ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          : state === 'ok' ? '✓' : state === 'error' ? '✕'
                          : <Save className="h-3.5 w-3.5" />}
                      </Button>
                    </div>
                    {err && <p className="text-xs text-red-500">{err}</p>}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Blacklist Beheer</CardTitle>
          <CardDescription>Deployer-wallets en token-mints die automatisch worden geblokkeerd</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input placeholder="Adres (base58)" value={newAddress} onChange={(e) => setNewAddress(e.target.value)} className="h-8 flex-1 font-mono text-xs" />
            <Input placeholder="Reden (optioneel)" value={newReason} onChange={(e) => setNewReason(e.target.value)} className="h-8 flex-1 text-sm" />
            <Button size="sm" onClick={addToBlacklist} className="h-8 shrink-0">
              <Plus className="mr-1 h-3.5 w-3.5" /> Toevoegen
            </Button>
          </div>
          <Separator />
          {blacklist.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Geen lokaal toegevoegde adressen. De bot laadt <code className="rounded bg-muted px-1 text-xs">src/blacklist.json</code> bij opstart.
            </p>
          ) : (
            <div className="space-y-2">
              {blacklist.map(({ address, reason }) => (
                <div key={address} className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2">
                  <div>
                    <p className="font-mono text-xs">{address}</p>
                    <p className="text-xs text-muted-foreground">{reason}</p>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => removeFromBlacklist(address)} className="h-7 w-7 text-red-500 hover:text-red-400">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="text-base">Bot Beheer</CardTitle></CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => { getSocket().emit('stop_bot'); setTimeout(() => getSocket().emit('start_bot'), 1000); }}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Bot herstarten
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
