import React, { useEffect, useMemo, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { Alert, Button, ConfigProvider, DatePicker, Layout, Space, Table, Tag, Typography, message } from 'antd'
import {
  BarChartOutlined,
  ClockCircleOutlined,
  DatabaseOutlined,
  ReloadOutlined,
  ThunderboltOutlined,
  UserOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'
import zhCN from 'antd/locale/zh_CN'
import { getDailyUsage, getUsageStats } from './api'
import './styles.css'

const { Content } = Layout
const { RangePicker } = DatePicker
const { Text } = Typography
const numberFormat = new Intl.NumberFormat('zh-CN')

function formatNumber(value) {
  return numberFormat.format(Number(value || 0))
}

function formatDateTime(value) {
  if (!value) return '-'
  const parsed = dayjs(value)
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm:ss') : value
}

function defaultRange() {
  return [dayjs().subtract(6, 'day'), dayjs()]
}

function Metric({ label, value, icon }) {
  return (
    <div className="metric">
      <div className="metric-icon">{icon}</div>
      <span>{label}</span>
      <strong>{formatNumber(value)}</strong>
    </div>
  )
}

function App() {
  const [range, setRange] = useState(defaultRange)
  const [usageData, setUsageData] = useState(null)
  const [kdocsStats, setKdocsStats] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const loadDashboard = async (nextRange = range) => {
    try {
      setLoading(true)
      setError('')
      const [start, end] = nextRange
      const [usageResponse, kdocsResponse] = await Promise.all([
        getDailyUsage({
          start: start.format('YYYY-MM-DD'),
          end: end.format('YYYY-MM-DD'),
        }),
        getUsageStats({ basis: 'events', at: end.toISOString() }).catch((err) => ({ __error: err })),
      ])
      setUsageData(usageResponse)
      if (!kdocsResponse.__error) {
        setKdocsStats(kdocsResponse)
      }
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.response?.data?.message || err.message || '加载 MiniMax 调用数据失败'
      setError(detail)
      message.error(detail)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDashboard()
  }, [])

  const totals = usageData?.totals || {}
  const daily = usageData?.daily || []
  const users = usageData?.users || []
  const selectedDetailDate = usageData?.range?.end || range?.[1]?.format('YYYY-MM-DD') || dayjs().format('YYYY-MM-DD')
  const maxDaily = Math.max(1, ...daily.map((item) => Number(item.generatedImages || 0)))
  const activeUserDays = useMemo(() => users.filter((item) => Number(item.requestCount || 0) > 0).length, [users])
  const selectedDateUsers = useMemo(
    () => users.filter((item) => item.date === selectedDetailDate),
    [users, selectedDetailDate]
  )

  const userColumns = [
    {
      title: '用户',
      dataIndex: 'userName',
      width: 180,
      fixed: 'left',
      render: (value, record) => (
        <div className="product-cell">
          <span>{value}</span>
          <small>ID {record.userId}</small>
        </div>
      ),
    },
    {
      title: '类型',
      dataIndex: 'userType',
      width: 120,
      render: (value) => value ? <Tag color="blue">{value}</Tag> : <Tag>员工</Tag>,
    },
    { title: '调用次数', dataIndex: 'requestCount', sorter: (a, b) => a.requestCount - b.requestCount, render: formatNumber },
    { title: '请求图片', dataIndex: 'requestedImages', sorter: (a, b) => a.requestedImages - b.requestedImages, render: formatNumber },
    { title: '成功图片', dataIndex: 'generatedImages', sorter: (a, b) => a.generatedImages - b.generatedImages, render: formatNumber },
    {
      title: '失败',
      dataIndex: 'failedCount',
      sorter: (a, b) => a.failedCount - b.failedCount,
      render: (value) => Number(value || 0) ? <Tag color="red">{value}</Tag> : <Tag color="green">0</Tag>,
    },
    { title: '平均耗时', dataIndex: 'avgLatencyMs', render: (value) => `${formatNumber(value)} ms` },
  ]

  const kdocsColumns = [
    { title: '表格列', dataIndex: 'column', width: 150 },
    { title: '接口字段', dataIndex: 'field', width: 220 },
    { title: '当前汇总值', dataIndex: 'value', width: 160, render: formatNumber },
    { title: '说明', dataIndex: 'description' },
  ]

  const kdocsMappingRows = [
    {
      column: '第 16 列',
      field: 'weekly_usage_count',
      value: kdocsStats?.summary?.weekly_usage_count || 0,
      description: '本周使用次数，后续用于填入 AI 产品库表格对应列。',
    },
    {
      column: '第 17 列',
      field: 'monthly_active_users',
      value: kdocsStats?.summary?.monthly_usage_count || 0,
      description: '本月使用次数，后续用于填入 AI 产品库表格对应列。',
    },
    {
      column: '第 18 列',
      field: 'user_feedback_count',
      value: kdocsStats?.summary?.total_usage_count || 0,
      description: '总使用次数，后续用于填入 AI 产品库表格对应列。',
    },
  ]

  return (
    <Layout className="admin-shell">
      <Content className="admin-content">
        <section className="toolbar">
          <div>
            <h1>每日生图调用情况</h1>
            <p>主监控口径仍为 MiniMax 生图接口调用；下方同步展示 /kdocs-sync 使用统计字段映射，供后续自动填表接入。</p>
          </div>
          <Space wrap>
            <RangePicker value={range} allowClear={false} onChange={(value) => value && setRange(value)} />
            <Button type="primary" icon={<ReloadOutlined />} loading={loading} onClick={() => loadDashboard()}>
              刷新
            </Button>
          </Space>
        </section>

        {error && <Alert type="error" message="加载失败" description={error} closable onClose={() => setError('')} />}

        <section className="metrics">
          <Metric label="MiniMax 总调用次数" value={totals.requestCount} icon={<ThunderboltOutlined />} />
          <Metric label="成功图片数" value={totals.generatedImages} icon={<BarChartOutlined />} />
          <Metric label="失败次数" value={totals.failedCount} icon={<ClockCircleOutlined />} />
          <Metric label="活跃用户天数" value={activeUserDays} icon={<UserOutlined />} />
        </section>

        <section className="panel">
          <div className="panel-title">每日总体出图</div>
          <div className="bars">
            {daily.map((item) => (
              <div className="bar-row" key={item.date}>
                <span>{item.date.slice(5)}</span>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{
                      width: Number(item.generatedImages || 0)
                        ? `${Math.max(4, (Number(item.generatedImages || 0) / maxDaily) * 100)}%`
                        : '0%',
                    }}
                  />
                </div>
                <strong>{formatNumber(item.generatedImages)} 张</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="panel">
          <div className="panel-title">用户明细（{selectedDetailDate}）</div>
          <Table
            rowKey={(record) => `${record.date}-${record.userId}`}
            columns={userColumns}
            dataSource={selectedDateUsers}
            loading={loading}
            pagination={{ pageSize: 12, showSizeChanger: false }}
            scroll={{ x: 860 }}
          />
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <div className="panel-title">AI 产品库统计列接入预览</div>
              <Text type="secondary">
                数据来自 /kdocs-sync/api/products/usage-stats?basis=events。当前页面只读取和展示，不执行任何表格写入。
              </Text>
            </div>
            <Tag color="green">events</Tag>
          </div>
          <div className="period-grid">
            <div><span>统计基准</span><strong>{formatDateTime(kdocsStats?.period?.at || kdocsStats?.generated_at)}</strong></div>
            <div><span>本周起点</span><strong>{formatDateTime(kdocsStats?.period?.week_start)}</strong></div>
            <div><span>本月起点</span><strong>{formatDateTime(kdocsStats?.period?.month_start)}</strong></div>
            <div><span>下月起点</span><strong>{formatDateTime(kdocsStats?.period?.next_month_start)}</strong></div>
          </div>
          <div className="mapping-table">
            <Table
              rowKey="field"
              columns={kdocsColumns}
              dataSource={kdocsMappingRows}
              pagination={false}
              size="middle"
            />
          </div>
        </section>
      </Content>
    </Layout>
  )
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <ConfigProvider locale={zhCN}>
    <App />
  </ConfigProvider>
)
