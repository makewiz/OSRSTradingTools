
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { API_BASE_URL } from "../config";

interface Watch {
    id: number;
    discord_id: string;
    item_id: number;
    itemName?: string;
    day_change_threshold: number | null;
    one_hour_change_threshold: number | null;
    cooldown_seconds: number | null;
    enabled: boolean;
    created_at: number;
    last_notified_at: number | null;
    last_notified_1h_at: number | null;
}

interface AdvancedWatch {
    id: number;
    discord_id: string;
    name: string | null;
    min_buy_price: number | null;
    max_buy_price: number | null;
    min_sell_price: number | null;
    max_sell_price: number | null;
    min_volume: number | null;
    min_change_1h: number | null;
    min_change_24h: number | null;
    is_members: boolean | null;
    min_buy_limit: number | null;
    max_buy_limit: number | null;
    min_margin: number | null;
    max_margin: number | null;
    min_profit: number | null;
    max_profit: number | null;
    min_roi: number | null;
    min_potential_profit: number | null;
    cooldown_minutes: number;
    order_by: string;
    direction: 'asc' | 'desc';
    max_count: number;
    created_at: number;
    enabled: boolean;
}

export const Watches: React.FC = () => {
    const { token, fetchWithAuth } = useAuth();
    const [watches, setWatches] = useState<Watch[]>([]);
    const [advancedWatches, setAdvancedWatches] = useState<AdvancedWatch[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Edit state for Simple Watches
    const [editingWatchId, setEditingWatchId] = useState<number | null>(null);
    const [editThreshold, setEditThreshold] = useState<string>("");
    const [editPeriod, setEditPeriod] = useState<'1h' | '24h'>('1h');
    const [editCooldown, setEditCooldown] = useState<string>("");

    // Create/Edit State for Advanced Watches
    const [showAdvancedModal, setShowAdvancedModal] = useState(false);
    const [editingAdvancedId, setEditingAdvancedId] = useState<number | null>(null);

    // Initial State for Advanced Form
    const initialAdvForm: Partial<AdvancedWatch> = {
        cooldown_minutes: 60,
        max_count: 10,
        order_by: 'profit',
        direction: 'desc',
        is_members: null
    };
    const [advForm, setAdvForm] = useState<Partial<AdvancedWatch>>(initialAdvForm);

    useEffect(() => {
        if (token) fetchDat();
    }, [token]);

    const fetchDat = async () => {
        try {
            setLoading(true);
            const [res1, res2] = await Promise.all([
                fetchWithAuth(`${API_BASE_URL}/api/discord/settings`),
                fetchWithAuth(`${API_BASE_URL}/api/discord/advanced-watches`)
            ]);

            if (!res1.ok || !res2.ok) throw new Error("Failed to fetch settings");

            const data1 = await res1.json();
            const data2 = await res2.json();

            setWatches(data1.watches || []);
            setAdvancedWatches(data2.watches || []);
        } catch (err: any) {
            setError(err.message || "Failed to load watches");
        } finally {
            setLoading(false);
        }
    };

    // --- Simple Watch Logic ---
    const handleRemoveWatch = async (itemId: number) => {
        if (!confirm("Are you sure you want to stop watching this item?")) return;
        try {
            setWatches(prev => prev.filter(w => w.item_id !== itemId));
            await fetchWithAuth(`${API_BASE_URL}/api/discord/watch/${itemId}`, { method: "DELETE" });
        } catch (err) {
            setError("Failed to remove watch");
            fetchDat();
        }
    };

    const startEditing = (watch: Watch) => {
        setEditingWatchId(watch.item_id);
        if (watch.one_hour_change_threshold !== null) {
            setEditPeriod('1h');
            setEditThreshold(watch.one_hour_change_threshold.toString());
        } else {
            setEditPeriod('24h');
            setEditThreshold(watch.day_change_threshold?.toString() || "");
        }
        setEditCooldown((watch.cooldown_seconds || 3600).toString());
    };

    const saveEdit = async (itemId: number) => {
        const threshold = parseFloat(editThreshold);
        const cooldown = parseInt(editCooldown, 10);

        if (isNaN(threshold) || threshold < 0) return alert("Invalid threshold");
        if (isNaN(cooldown) || cooldown < 0) return alert("Invalid cooldown");

        try {
            setWatches(prev => prev.map(w => {
                if (w.item_id === itemId) {
                    return {
                        ...w,
                        cooldown_seconds: cooldown,
                        one_hour_change_threshold: editPeriod === '1h' ? threshold : null,
                        day_change_threshold: editPeriod === '24h' ? threshold : null
                    };
                }
                return w;
            }));
            setEditingWatchId(null);

            await fetchWithAuth(`${API_BASE_URL}/api/discord/watch/${itemId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ threshold, period: editPeriod, cooldown })
            });
        } catch (err) {
            setError("Failed to update watch");
            fetchDat();
        }
    };


    // --- Advanced Watch Logic ---

    const handleRemoveAdvancedWatch = async (id: number) => {
        if (!confirm("Delete this advanced watch?")) return;

        // Capture previous state for rollback
        const previousWatches = advancedWatches;

        try {
            setAdvancedWatches(prev => prev.filter(w => w.id !== id));
            const res = await fetchWithAuth(`${API_BASE_URL}/api/discord/advanced-watches/${id}`, { method: "DELETE" });

            if (!res.ok) {
                throw new Error("Failed to delete advanced watch");
            }
        } catch (err) {
            setAdvancedWatches(previousWatches);
            setError("Failed to remove advanced watch");
        }
    };

    const openCreateAdvanced = () => {
        setEditingAdvancedId(null);
        setAdvForm(initialAdvForm);
        setShowAdvancedModal(true);
    }

    const openEditAdvanced = (watch: AdvancedWatch) => {
        setEditingAdvancedId(watch.id);
        setAdvForm({ ...watch }); // Copy all properties
        setShowAdvancedModal(true);
    }

    const saveAdvancedWatch = async () => {
        try {
            const url = editingAdvancedId
                ? `${API_BASE_URL}/api/discord/advanced-watches/${editingAdvancedId}`
                : `${API_BASE_URL}/api/discord/advanced-watches`;

            const method = editingAdvancedId ? "PUT" : "POST";

            const res = await fetchWithAuth(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(advForm)
            });

            if (!res.ok) throw new Error("Failed to save watch");
            const data = await res.json();

            if (editingAdvancedId) {
                setAdvancedWatches(prev => prev.map(w => w.id === editingAdvancedId ? data.watch : w));
            } else {
                setAdvancedWatches(prev => [data.watch, ...prev]);
            }

            setShowAdvancedModal(false);
        } catch (err) {
            alert("Failed to save watch");
        }
    };

    const toggleAdvancedWatch = async (watch: AdvancedWatch) => {
        const newEnabled = !watch.enabled;
        // Optimistic update
        setAdvancedWatches(prev => prev.map(w => w.id === watch.id ? { ...w, enabled: newEnabled } : w));

        try {
            const res = await fetchWithAuth(`${API_BASE_URL}/api/discord/advanced-watches/${watch.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ enabled: newEnabled })
            });

            if (!res.ok) throw new Error("Failed to toggle watch");
        } catch (err) {
            // Revert if failed
            setAdvancedWatches(prev => prev.map(w => w.id === watch.id ? { ...w, enabled: !newEnabled } : w));
            setError("Failed to update watch status");
        }
    };

    const updateAdvForm = (key: string, value: any) => {
        if (value === "") value = null;
        else if (key === 'is_members') {
            // handled by select
        }
        else if (['name', 'order_by', 'direction'].includes(key)) { /* string is fine */ }
        else if (!isNaN(parseFloat(value))) value = parseFloat(value);

        setAdvForm(prev => ({ ...prev, [key]: value }));
    };

    return (
        <div className="watches-page app-main" style={{ maxWidth: '1000px', margin: '0 auto', paddingBottom: '50px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h1>My Price Alerts</h1>
                <button className="page-button" onClick={openCreateAdvanced} style={{ background: '#4caf50', padding: '10px 20px', fontSize: '1em' }}>+ New Smart Watch</button>
            </div>

            {error && <div className="error-message">{error}</div>}
            {loading && <p>Loading...</p>}

            {!loading && (
                <>
                    {/* Advanced Watches List First (Priority) */}
                    <div className="section" style={{ background: 'rgba(0,0,0,0.2)', padding: '20px', borderRadius: '8px', marginBottom: '30px' }}>
                        <h2>Smart Watches</h2>
                        {advancedWatches.length === 0 ? (
                            <p style={{ color: '#aaa', fontStyle: 'italic' }}>No advanced watches configured. Create one to track complex market movements.</p>
                        ) : (
                            <div className="table-wrapper">
                                <table className="items-table" style={{ width: '100%' }}>
                                    <thead>
                                        <tr>
                                            <th>Watch Rules</th>
                                            <th>Settings</th>
                                            <th>Status</th>
                                            <th style={{ textAlign: 'right' }}>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {advancedWatches.map(w => (
                                            <tr key={w.id}>
                                                <td>
                                                    <div style={{ fontWeight: 'bold', fontSize: '1.1em', marginBottom: '5px' }}>{w.name || "Unnamed Watch"}</div>
                                                    <div style={{ fontSize: '0.9em', color: '#ccc', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                                        {w.min_buy_price && <span className="tag">Min Buy: {w.min_buy_price}</span>}
                                                        {w.max_buy_price && <span className="tag">Max Buy: {w.max_buy_price}</span>}
                                                        {w.min_volume && <span className="tag">Vol &gt; {w.min_volume}</span>}
                                                        {w.min_change_1h && <span className="tag">1H: {w.min_change_1h}%</span>}
                                                        {w.min_change_24h && <span className="tag">24H: {w.min_change_24h}%</span>}
                                                        {w.min_profit && <span className="tag">Profit &gt; {w.min_profit}</span>}
                                                        {w.min_roi && <span className="tag">ROI &gt; {w.min_roi}%</span>}
                                                        {w.min_margin && <span className="tag">Margin &gt; {w.min_margin}</span>}
                                                        {w.min_potential_profit && <span className="tag">Pot. Profit &gt; {w.min_potential_profit}</span>}
                                                        {(w.is_members !== null) && <span className="tag">Mem: {w.is_members ? 'Yes' : 'No'}</span>}
                                                    </div>
                                                </td>
                                                <td style={{ minWidth: '150px' }}>
                                                    <div>⏱ {w.cooldown_minutes}m Cooldown</div>
                                                    <div style={{ fontSize: '0.9em', color: '#aaa' }}>
                                                        Top {w.max_count} by {w.order_by} ({w.direction})
                                                    </div>
                                                </td>
                                                <td>
                                                    <label className="switch">
                                                        <input
                                                            type="checkbox"
                                                            checked={w.enabled}
                                                            onChange={() => toggleAdvancedWatch(w)}
                                                        />
                                                        <span className="slider round"></span>
                                                    </label>
                                                </td>
                                                <td style={{ textAlign: 'right', minWidth: '100px' }}>
                                                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                                                        <button className="page-button icon-btn" onClick={() => openEditAdvanced(w)}>✎</button>
                                                        <button className="page-button icon-btn" style={{ color: '#f44336' }} onClick={() => handleRemoveAdvancedWatch(w.id)}>🗑</button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>

                    {/* Simple Watches List */}
                    <div className="section" style={{ background: 'rgba(0,0,0,0.2)', padding: '20px', borderRadius: '8px' }}>
                        <h2>Individual Item Alerts</h2>
                        {watches.length === 0 ? (
                            <p style={{ color: '#aaa' }}>You have no active item alerts. Visit an item page to track single items.</p>
                        ) : (
                            <div className="table-wrapper">
                                <table className="items-table" style={{ width: '100%' }}>
                                    <thead>
                                        <tr>
                                            <th>Item</th>
                                            <th>Type</th>
                                            <th>Threshold</th>
                                            <th>Cooldown</th>
                                            <th style={{ textAlign: 'right' }}>Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {watches.map(w => {
                                            const isEditing = editingWatchId === w.item_id;
                                            const activePeriod = w.one_hour_change_threshold !== null ? '1H' : '24H';
                                            const activeThreshold = w.one_hour_change_threshold !== null ? w.one_hour_change_threshold : w.day_change_threshold;
                                            return (
                                                <tr key={w.id}>
                                                    <td>
                                                        <Link to={`/item/${w.item_id}`} className="item-name-link">
                                                            {w.itemName || `Item ${w.item_id}`}
                                                        </Link>
                                                    </td>
                                                    <td>
                                                        {isEditing ? (
                                                            <select value={editPeriod} onChange={(e) => setEditPeriod(e.target.value as any)} className="dark-input">
                                                                <option value="1h">1H Change</option>
                                                                <option value="24h">24H Change</option>
                                                            </select>
                                                        ) : <span className="tag" style={{ background: activePeriod === '1H' ? '#4caf50' : '#2196f3' }}>{activePeriod} Change</span>}
                                                    </td>
                                                    <td>
                                                        {isEditing ? (
                                                            <input type="number" value={editThreshold} onChange={e => setEditThreshold(e.target.value)} className="dark-input" style={{ width: '60px' }} step="0.1" />
                                                        ) : `${activeThreshold?.toFixed(1)}%`}
                                                    </td>
                                                    <td>
                                                        {isEditing ? (
                                                            <input type="number" value={editCooldown} onChange={e => setEditCooldown(e.target.value)} className="dark-input" style={{ width: '80px' }} />
                                                        ) : `${w.cooldown_seconds || 3600}s`}
                                                    </td>
                                                    <td style={{ textAlign: 'right' }}>
                                                        {isEditing ? (
                                                            <div style={{ display: 'flex', gap: '5px', justifyContent: 'flex-end' }}>
                                                                <button className="page-button" style={{ background: '#4caf50', padding: '4px 8px' }} onClick={() => saveEdit(w.item_id)}>✓</button>
                                                                <button className="page-button" style={{ background: '#777', padding: '4px 8px' }} onClick={() => setEditingWatchId(null)}>✕</button>
                                                            </div>
                                                        ) : (
                                                            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                                                                <button className="page-button icon-btn" onClick={() => startEditing(w)}>✎</button>
                                                                <button className="page-button icon-btn" style={{ color: '#f44336' }} onClick={() => handleRemoveWatch(w.item_id)}>🗑</button>
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </>
            )}

            {showAdvancedModal && (
                <div className="modal-overlay" style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000
                }}>
                    <div className="modal-content" style={{
                        background: '#1e1e1e', padding: '0', borderRadius: '12px', width: '700px', maxWidth: '95vw',
                        maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column'
                    }}>
                        <div style={{ padding: '20px', borderBottom: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h2 style={{ margin: 0 }}>{editingAdvancedId ? "Edit Smart Watch" : "Create Smart Watch"}</h2>
                            <button className="page-button" style={{ background: 'transparent', padding: '5px' }} onClick={() => setShowAdvancedModal(false)}>✕</button>
                        </div>

                        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

                            {/* Section: General */}
                            <div className="form-section">
                                <label style={{ display: 'block', marginBottom: '5px', color: '#ccc' }}>Watch Name</label>
                                <input
                                    type="text"
                                    className="dark-input"
                                    style={{ width: '100%', padding: '10px' }}
                                    placeholder="e.g. High Margin Flips"
                                    value={advForm.name || ""}
                                    onChange={e => updateAdvForm('name', e.target.value)}
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                                {/* Section: Market Filters */}
                                <div>
                                    <h3 style={{ fontSize: '1em', color: '#4caf50', marginBottom: '10px', borderBottom: '1px solid #333', paddingBottom: '5px' }}>Price & Volume</h3>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
                                        <div className="form-group">
                                            <label>Min Buy Price</label>
                                            <input type="number" className="dark-input" value={advForm.min_buy_price || ""} onChange={e => updateAdvForm('min_buy_price', e.target.value)} />
                                        </div>
                                        <div className="form-group">
                                            <label>Max Buy Price</label>
                                            <input type="number" className="dark-input" value={advForm.max_buy_price || ""} onChange={e => updateAdvForm('max_buy_price', e.target.value)} />
                                        </div>
                                        <div className="form-group">
                                            <label>Min Volume</label>
                                            <input type="number" className="dark-input" value={advForm.min_volume || ""} onChange={e => updateAdvForm('min_volume', e.target.value)} />
                                        </div>
                                        <div className="form-group">
                                            <label>Min 1H Change % (+/-)</label>
                                            <input type="number" className="dark-input" step="0.1" value={advForm.min_change_1h || ""} onChange={e => updateAdvForm('min_change_1h', e.target.value)} />
                                        </div>
                                    </div>
                                </div>

                                {/* Section: Profitability */}
                                <div>
                                    <h3 style={{ fontSize: '1em', color: '#2196f3', marginBottom: '10px', borderBottom: '1px solid #333', paddingBottom: '5px' }}>Profitability</h3>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
                                        <div className="form-group">
                                            <label>Min Profit (Net)</label>
                                            <input type="number" className="dark-input" value={advForm.min_profit || ""} onChange={e => updateAdvForm('min_profit', e.target.value)} />
                                        </div>
                                        <div className="form-group">
                                            <label>Min ROI %</label>
                                            <input type="number" className="dark-input" step="0.1" value={advForm.min_roi || ""} onChange={e => updateAdvForm('min_roi', e.target.value)} />
                                        </div>
                                        <div className="form-group">
                                            <label>Min Margin</label>
                                            <input type="number" className="dark-input" value={advForm.min_margin || ""} onChange={e => updateAdvForm('min_margin', e.target.value)} />
                                        </div>
                                        <div className="form-group">
                                            <label>Members Only</label>
                                            <select className="dark-input" value={advForm.is_members === null ? "" : advForm.is_members.toString()} onChange={e => updateAdvForm('is_members', e.target.value === 'true' ? true : e.target.value === 'false' ? false : null)}>
                                                <option value="">Any</option>
                                                <option value="true">Yes</option>
                                                <option value="false">No</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Section: Settings */}
                            <div>
                                <h3 style={{ fontSize: '1em', color: '#ff9800', marginBottom: '10px', borderBottom: '1px solid #333', paddingBottom: '5px' }}>Alert Settings</h3>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                                    <div className="form-group">
                                        <label>Sort By</label>
                                        <select className="dark-input" value={advForm.order_by || "profit"} onChange={e => updateAdvForm('order_by', e.target.value)}>
                                            <option value="profit">Profit</option>
                                            <option value="roi">ROI</option>
                                            <option value="margin">Margin</option>
                                            <option value="volume">Volume</option>
                                            <option value="oneHourChange">1H Change</option>
                                            <option value="dayChange">24H Change</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Direction</label>
                                        <select className="dark-input" value={advForm.direction || "desc"} onChange={e => updateAdvForm('direction', e.target.value)}>
                                            <option value="desc">Descending (High to Low)</option>
                                            <option value="asc">Ascending (Low to High)</option>
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label>Max Items Limit</label>
                                        <input type="number" className="dark-input" value={advForm.max_count || 10} onChange={e => updateAdvForm('max_count', e.target.value)} />
                                    </div>
                                    <div className="form-group">
                                        <label>Cooldown (minutes)</label>
                                        <input type="number" className="dark-input" value={advForm.cooldown_minutes || 60} onChange={e => updateAdvForm('cooldown_minutes', e.target.value)} />
                                    </div>
                                </div>
                            </div>

                        </div>

                        <div style={{ padding: '20px', borderTop: '1px solid #333', display: 'flex', justifyContent: 'flex-end', gap: '10px', background: '#252525', borderRadius: '0 0 12px 12px' }}>
                            <button className="page-button" style={{ background: '#444' }} onClick={() => setShowAdvancedModal(false)}>Cancel</button>
                            <button className="page-button" style={{ background: '#4caf50', fontWeight: 'bold' }} onClick={saveAdvancedWatch}>
                                {editingAdvancedId ? "Save Changes" : "Create Watch"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <style>{`
                .form-group { display: flex; flex-direction: column; gap: 5px; }
                .form-group label { font-size: 0.9em; color: #aaa; }
                .tag { background: #333; padding: 2px 6px; border-radius: 4px; font-size: 0.85em; border: 1px solid #444; }
                .dark-input { background: #333; border: 1px solid #444; color: #fff; padding: 8px; border-radius: 4px; width: 100%; box-sizing: border-box; }
                .dark-input:focus { border-color: #4caf50; outline: none; }

                /* Toggle Switch */
                .switch {
                  position: relative;
                  display: inline-block;
                  width: 40px;
                  height: 22px;
                }
                .switch input { opacity: 0; width: 0; height: 0; }
                .slider {
                  position: absolute;
                  cursor: pointer;
                  top: 0; left: 0; right: 0; bottom: 0;
                  background-color: #ccc;
                  -webkit-transition: .4s;
                  transition: .4s;
                  border-radius: 22px;
                }
                .slider:before {
                  position: absolute;
                  content: "";
                  height: 16px;
                  width: 16px;
                  left: 3px;
                  bottom: 3px;
                  background-color: white;
                  -webkit-transition: .4s;
                  transition: .4s;
                  border-radius: 50%;
                }
                input:checked + .slider {
                  background-color: #4caf50;
                }
                input:focus + .slider {
                  box-shadow: 0 0 1px #4caf50;
                }
                input:checked + .slider:before {
                  -webkit-transform: translateX(18px);
                  -ms-transform: translateX(18px);
                  transform: translateX(18px);
                }
            `}</style>
        </div>
    );
};
