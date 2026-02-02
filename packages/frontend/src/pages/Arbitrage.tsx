import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArbitrageSetResult, DecantResult } from '../types/arbitrage';
import { API_BASE_URL } from '../config';


const ArbitragePage: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'sets' | 'decanting'>('sets');
    const [setsData, setSetsData] = useState<ArbitrageSetResult[]>([]);
    const [decantData, setDecantData] = useState<DecantResult[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'profit', direction: 'desc' });

    useEffect(() => {
        fetchData();
    }, [activeTab]);

    const fetchData = async () => {
        setLoading(true);
        setError(null);
        try {
            if (activeTab === 'sets') {
                const res = await fetch(`${API_BASE_URL}/api/arbitrage/sets`);

                if (!res.ok) throw new Error('Failed to fetch set arbitrage data');
                const data = await res.json();
                setSetsData(data);
            } else {
                const res = await fetch(`${API_BASE_URL}/api/arbitrage/decanting`);

                if (!res.ok) throw new Error('Failed to fetch decanting data');
                const data = await res.json();
                setDecantData(data);
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleSort = (key: string) => {
        setSortConfig(current => {
            if (current.key === key) {
                return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
            }
            return { key, direction: 'desc' }; // Default to descending for new metrics
        });
    };

    const getSortedData = <T extends any>(data: T[]): T[] => {
        if (!sortConfig) return data;

        return [...data].sort((a, b) => {
            const aValue = a[sortConfig.key as keyof T];
            const bValue = b[sortConfig.key as keyof T];

            if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    };

    const renderSortIcon = (columnKey: string) => {
        if (sortConfig.key !== columnKey) return <span style={{ opacity: 0.3, marginLeft: '5px' }}>↕</span>;
        return <span style={{ marginLeft: '5px' }}>{sortConfig.direction === 'asc' ? '↑' : '↓'}</span>;
    };

    const formatNumber = (num: number) => new Intl.NumberFormat().format(num);
    const formatCurrency = (num: number) => `${formatNumber(Math.floor(num))} gp`;
    const formatPercent = (num: number) => `${num.toFixed(2)}%`;

    const sortedSets = activeTab === 'sets' ? getSortedData(setsData) : [];
    const sortedDecant = activeTab === 'decanting' ? getSortedData(decantData) : [];

    return (
        <main className="app-main">
            <section className="controls">
                <h2>Market Arbitrage</h2>
                <div style={{ marginBottom: "15px", color: "var(--text-secondary)" }}>
                    Identify risk-free profit opportunities through item conversion.
                </div>

                {/* Tabs */}
                <div style={{ display: 'flex', gap: '10px', marginBottom: '15px' }}>
                    <button
                        onClick={() => setActiveTab('sets')}
                        className="page-button"
                        style={{
                            backgroundColor: activeTab === 'sets' ? "var(--secondary-color)" : "#444"
                        }}
                    >
                        Item Sets
                    </button>
                    <button
                        onClick={() => setActiveTab('decanting')}
                        className="page-button"
                        style={{
                            backgroundColor: activeTab === 'decanting' ? "var(--secondary-color)" : "#444"
                        }}
                    >
                        Potion Decanting
                    </button>
                </div>
            </section>

            {loading && <p>Loading arbitrage data...</p>}
            {error && <p className="error">{error}</p>}

            {!loading && !error && activeTab === 'sets' && (
                <div className="table-wrapper">
                    <table className="items-table">
                        <thead>
                            <tr>
                                <th onClick={() => handleSort('setName')}>Set Name {renderSortIcon('setName')}</th>
                                <th className="with-tooltip" data-tooltip="Assemble: Buy Parts -> Create Set. Break: Buy Set -> Extract Parts." onClick={() => handleSort('action')}>Action {renderSortIcon('action')}</th>
                                <th className="with-tooltip" data-tooltip="Instant buy price of input items" onClick={() => handleSort('cost')}>Cost {renderSortIcon('cost')}</th>
                                <th className="with-tooltip" data-tooltip="Instant sell price of output items (Tax deducted)" onClick={() => handleSort('revenue')}>Revenue {renderSortIcon('revenue')}</th>
                                <th className="with-tooltip" data-tooltip="Net Profit per set" onClick={() => handleSort('profit')}>Profit {renderSortIcon('profit')}</th>
                                <th className="with-tooltip" data-tooltip="Max theoretical profit per hr based on GE limits & volume" onClick={() => handleSort('profitPerHour')}>Profit/Hr {renderSortIcon('profitPerHour')}</th>
                                <th className="with-tooltip" data-tooltip="Return on Investment %" onClick={() => handleSort('roi')}>ROI {renderSortIcon('roi')}</th>
                                <th className="with-tooltip" data-tooltip="24h volume of the lowest volume item in the set" onClick={() => handleSort('volume')}>Volume (Min) {renderSortIcon('volume')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedSets.length === 0 ? (
                                <tr>
                                    <td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>No profitable opportunities found right now.</td>
                                </tr>
                            ) : (
                                sortedSets.map((row) => (
                                    <tr key={row.setId + row.action}>
                                        <td style={{ fontWeight: 'bold' }}>
                                            <Link
                                                to={`/item/${row.setId}`}
                                                state={{ fromArbitrage: true }}
                                                className="item-name-link"
                                                style={{ textDecoration: 'none', color: 'inherit' }}
                                            >
                                                {row.setName}
                                            </Link>
                                        </td>
                                        <td>
                                            <span
                                                style={{
                                                    padding: '2px 8px',
                                                    borderRadius: '4px',
                                                    fontSize: '0.85em',
                                                    backgroundColor: row.action === 'ASSEMBLE' ? '#2e7d32' : '#ed6c02',
                                                    color: 'white'
                                                }}
                                            >
                                                {row.action}
                                            </span>
                                        </td>
                                        <td>{formatCurrency(row.cost)}</td>
                                        <td>{formatCurrency(row.revenue)}</td>
                                        <td className="day-change positive">
                                            {formatCurrency(row.profit)}
                                        </td>
                                        <td className="day-change positive">
                                            {formatCurrency(row.profitPerHour)}
                                        </td>
                                        <td className="day-change positive">
                                            {formatPercent(row.roi)}
                                        </td>
                                        <td style={{ color: "#aaa" }}>{formatNumber(row.volume)}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {!loading && !error && activeTab === 'decanting' && (
                <div className="table-wrapper">
                    <table className="items-table">
                        <thead>
                            <tr>
                                <th onClick={() => handleSort('potionName')}>Potion {renderSortIcon('potionName')}</th>
                                <th className="with-tooltip" data-tooltip="Dose conversion path">Conversion</th>
                                <th className="with-tooltip" data-tooltip="Cost normalized to 1 unit of 4-dose potion" onClick={() => handleSort('costPer4Dose')}>Cost (per 4-dose) {renderSortIcon('costPer4Dose')}</th>
                                <th className="with-tooltip" data-tooltip="Profit per 1 unit of resulting 4-dose potion" onClick={() => handleSort('profitPer4Dose')}>Profit (per 4-dose) {renderSortIcon('profitPer4Dose')}</th>
                                <th className="with-tooltip" data-tooltip="Max theoretical profit per hr based on GE limits & volume" onClick={() => handleSort('profitPerHour')}>Profit/Hr {renderSortIcon('profitPerHour')}</th>
                                <th className="with-tooltip" data-tooltip="Return on Investment %" onClick={() => handleSort('roi')}>ROI {renderSortIcon('roi')}</th>
                                <th className="with-tooltip" data-tooltip="24h volume of source potion" onClick={() => handleSort('buyVolume')}>Buy Volume {renderSortIcon('buyVolume')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedDecant.length === 0 ? (
                                <tr>
                                    <td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>No profitable decanting opportunities found.</td>
                                </tr>
                            ) : (
                                sortedDecant.map((row, idx) => (
                                    <tr key={idx}>
                                        <td style={{ fontWeight: 'bold' }}>
                                            <Link
                                                to={`/item/${row.targetId}`}
                                                state={{ fromArbitrage: true }}
                                                className="item-name-link"
                                                style={{ textDecoration: 'none', color: 'inherit' }}
                                            >
                                                {row.potionName}
                                            </Link>
                                        </td>
                                        <td>
                                            <span style={{ color: '#aaa' }}>
                                                ({row.sourceDose}) <span style={{ margin: '0 5px' }}>→</span> (4)
                                            </span>
                                        </td>
                                        <td>{formatCurrency(row.costPer4Dose)}</td>
                                        <td className="day-change positive">
                                            {formatCurrency(row.profitPer4Dose)}
                                        </td>
                                        <td className="day-change positive">
                                            {formatCurrency(row.profitPerHour)}
                                        </td>
                                        <td className="day-change positive">
                                            {formatPercent(row.roi)}
                                        </td>
                                        <td style={{ color: "#aaa" }}>{formatNumber(row.buyVolume)}</td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            )}
            <style>{`
                .item-name-link:hover {
                    text-decoration: underline !important;
                }
            `}</style>
        </main>
    );
};

export default ArbitragePage;
