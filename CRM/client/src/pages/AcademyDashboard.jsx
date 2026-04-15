import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Users, CreditCard, DollarSign, ClipboardCheck, TrendingUp, BookOpen, BarChart3, Loader2 } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getAcademyStats } from '../api';

const pageStyle = { padding: '24px 28px', background: '#f5f7fa', minHeight: '100vh' };
const cardStyle = { background: '#fff', border: '1px solid #e5e7ef', borderRadius: 14, padding: 20, marginBottom: 16 };
const headingStyle = { fontSize: 22, fontWeight: 700, color: '#1a1a2e', marginBottom: 4 };
const subStyle = { fontSize: 13, color: '#7a7f9a', marginBottom: 24 };

function StatCard({ icon: Icon, label, value, color = '#4a6cf7' }) {
  return (
    <div style={{ ...cardStyle, display: 'flex', alignItems: 'center', gap: 16, flex: 1, minWidth: 200 }}>
      <div style={{ width: 44, height: 44, borderRadius: 12, background: color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={20} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, color: '#1a1a2e' }}>{value}</div>
        <div style={{ fontSize: 12, color: '#7a7f9a', fontWeight: 500 }}>{label}</div>
      </div>
    </div>
  );
}

export default function AcademyDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadStats();
  }, []);

  async function loadStats() {
    try {
      setLoading(true);
      setError(null);
      const data = await getAcademyStats();
      setStats(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div style={{ ...pageStyle, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Loader2 size={28} color="#4a6cf7" style={{ animation: 'spin 1s linear infinite' }} />
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={pageStyle}>
        <div style={{ ...cardStyle, color: '#ef4444', textAlign: 'center', padding: 40 }}>
          <p style={{ fontWeight: 600, marginBottom: 8 }}>Failed to load dashboard</p>
          <p style={{ fontSize: 13, color: '#7a7f9a' }}>{error}</p>
          <button onClick={loadStats} style={{ marginTop: 12, padding: '8px 20px', background: '#4a6cf7', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, fontSize: 13 }}>Retry</button>
        </div>
      </div>
    );
  }

  const revenueTrend = stats?.revenue_trend || [];
  const recentEnrollments = stats?.recent_enrollments || [];

  return (
    <div style={pageStyle}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: '#4a6cf718', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <LayoutDashboard size={18} color="#4a6cf7" />
        </div>
        <h1 style={headingStyle}>Academy Dashboard</h1>
      </div>
      <p style={subStyle}>Overview of your academy performance, students, and revenue.</p>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        <StatCard icon={Users} label="Total Students" value={stats?.total_students ?? 0} color="#4a6cf7" />
        <StatCard icon={BookOpen} label="Active Subscribers" value={stats?.active_subscribers ?? 0} color="#22c55e" />
        <StatCard icon={DollarSign} label="Monthly Recurring Revenue" value={`$${(stats?.mrr ?? 0).toFixed(2)}`} color="#f59e0b" />
        <StatCard icon={ClipboardCheck} label="Pending Homework" value={stats?.pending_homework ?? 0} color="#ef4444" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <TrendingUp size={16} color="#4a6cf7" />
            <span style={{ fontSize: 14, fontWeight: 600, color: '#1a1a2e' }}>Revenue Trend</span>
          </div>
          {revenueTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <LineChart data={revenueTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7ef" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#7a7f9a' }} />
                <YAxis tick={{ fontSize: 11, fill: '#7a7f9a' }} />
                <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e5e7ef', fontSize: 12 }} />
                <Line type="monotone" dataKey="revenue" stroke="#4a6cf7" strokeWidth={2} dot={{ r: 3, fill: '#4a6cf7' }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 180, background: '#f5f7fa', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 13, color: '#7a7f9a' }}>No revenue data yet</span>
            </div>
          )}
        </div>

        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <BarChart3 size={16} color="#22c55e" />
            <span style={{ fontSize: 14, fontWeight: 600, color: '#1a1a2e' }}>Student Activity</span>
          </div>
          {revenueTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={revenueTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7ef" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#7a7f9a' }} />
                <YAxis tick={{ fontSize: 11, fill: '#7a7f9a' }} />
                <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e5e7ef', fontSize: 12 }} />
                <Bar dataKey="students" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 180, background: '#f5f7fa', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontSize: 13, color: '#7a7f9a' }}>No activity data yet</span>
            </div>
          )}
        </div>
      </div>

      <div style={cardStyle}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <CreditCard size={16} color="#f59e0b" />
          <span style={{ fontSize: 14, fontWeight: 600, color: '#1a1a2e' }}>Recent Enrollments</span>
        </div>
        {recentEnrollments.length > 0 ? (
          <div>
            {recentEnrollments.map((e, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: i % 2 === 0 ? '#f5f7fa' : '#fff', borderRadius: 8, marginBottom: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: '#4a6cf718', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Users size={14} color="#4a6cf7" />
                  </div>
                  <div>
                    <div className="private-value" style={{ fontSize: 13, fontWeight: 600, color: '#1a1a2e' }}>{e.student_name || e.name || 'Unknown Student'}</div>
                    <div style={{ fontSize: 11, color: '#7a7f9a' }}>{e.course_title || e.course || 'Unknown Course'}</div>
                  </div>
                </div>
                <span style={{ fontSize: 11, color: '#7a7f9a' }}>
                  {e.enrolled_at || e.date ? new Date(e.enrolled_at || e.date).toLocaleDateString() : ''}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ height: 80, background: '#f5f7fa', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 13, color: '#7a7f9a' }}>No recent enrollments</span>
          </div>
        )}
      </div>
    </div>
  );
}
