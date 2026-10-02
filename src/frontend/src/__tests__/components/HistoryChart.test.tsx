import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import HistoryChart from '../../components/HistoryChart';

vi.mock('../../api', () => ({
  api: vi.fn(),
}));

import { api } from '../../api';
const mockApi = vi.mocked(api);

const MOCK_VARS = {
  variables: ['battery.charge', 'ups.load', 'input.voltage', 'output.voltage'],
};

const MOCK_DATA = {
  variables: {
    'battery.charge': [[1000000, 85], [1000060, 84]],
    'ups.load': [[1000000, 34], [1000060, 35]],
  },
};

function renderChart() {
  return render(<HistoryChart upsName="testups" />);
}

describe('HistoryChart', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading skeleton on mount', () => {
    mockApi.mockImplementation(() => new Promise(() => {}));
    renderChart();
    expect(screen.getByText('24h')).toBeInTheDocument();
    expect(document.querySelector('.chart-skeleton')).toBeInTheDocument();
  });

  it('renders range selector buttons', async () => {
    mockApi
      .mockResolvedValueOnce(MOCK_VARS)
      .mockResolvedValueOnce(MOCK_DATA);

    renderChart();
    await waitFor(() => {
      expect(screen.getByText('1h')).toBeInTheDocument();
    });
    expect(screen.getByText('24h')).toBeInTheDocument();
    expect(screen.getByText('7d')).toBeInTheDocument();
    expect(screen.getByText('30d')).toBeInTheDocument();
  });

  it('renders variable checkboxes', async () => {
    mockApi
      .mockResolvedValueOnce(MOCK_VARS)
      .mockResolvedValueOnce(MOCK_DATA);

    renderChart();
    await waitFor(() => {
      expect(screen.getByText('battery.charge')).toBeInTheDocument();
    });
    expect(screen.getByText('ups.load')).toBeInTheDocument();
    expect(screen.getByText('input.voltage')).toBeInTheDocument();
    expect(screen.getByText('output.voltage')).toBeInTheDocument();
  });

  it('filters out static variables from checkboxes', async () => {
    mockApi
      .mockResolvedValueOnce({
        variables: [...MOCK_VARS.variables, 'device.mfr', 'driver.version', 'ups.mfr'],
      })
      .mockResolvedValueOnce(MOCK_DATA);

    renderChart();
    await waitFor(() => {
      expect(screen.getByText('battery.charge')).toBeInTheDocument();
    });
    expect(screen.queryByText('device.mfr')).not.toBeInTheDocument();
    expect(screen.queryByText('driver.version')).not.toBeInTheDocument();
    expect(screen.queryByText('ups.mfr')).not.toBeInTheDocument();
  });

  it('filters out numeric constants (nominals, thresholds, delays)', async () => {
    mockApi
      .mockResolvedValueOnce({
        variables: [
          'battery.charge', 'battery.runtime', 'input.voltage', 'input.frequency',
          'input.voltage.nominal', 'output.voltage.nominal', 'ups.realpower.nominal',
          'battery.charge.low', 'battery.charge.warning', 'battery.runtime.low',
          'input.voltage.minimum', 'input.voltage.maximum',
          'ups.delay.shutdown', 'ups.delay.start', 'battery.packs',
        ],
      })
      .mockResolvedValueOnce(MOCK_DATA);

    renderChart();
    await waitFor(() => {
      expect(screen.getByText('battery.charge')).toBeInTheDocument();
    });
    expect(screen.getByText('battery.runtime')).toBeInTheDocument();
    expect(screen.getByText('input.voltage')).toBeInTheDocument();
    expect(screen.getByText('input.frequency')).toBeInTheDocument();
    for (const c of [
      'input.voltage.nominal', 'output.voltage.nominal', 'ups.realpower.nominal',
      'battery.charge.low', 'battery.charge.warning', 'battery.runtime.low',
      'input.voltage.minimum', 'input.voltage.maximum',
      'ups.delay.shutdown', 'ups.delay.start', 'battery.packs',
    ]) {
      expect(screen.queryByText(c)).not.toBeInTheDocument();
    }
  });

  it('keeps phase-tagged measurements like input.L1.voltage', async () => {
    mockApi
      .mockResolvedValueOnce({
        variables: ['battery.charge', 'input.L1.voltage', 'output.L2.current'],
      })
      .mockResolvedValueOnce(MOCK_DATA);

    renderChart();
    await waitFor(() => {
      expect(screen.getByText('input.L1.voltage')).toBeInTheDocument();
    });
    expect(screen.getByText('output.L2.current')).toBeInTheDocument();
  });

  it('shows empty state when no data', async () => {
    mockApi
      .mockResolvedValueOnce(MOCK_VARS)
      .mockResolvedValueOnce({ variables: { 'battery.charge': [] } });

    renderChart();
    await waitFor(() => {
      expect(screen.getByText(/No historical data yet/)).toBeInTheDocument();
    });
  });

  it('highlights default range button', async () => {
    mockApi
      .mockResolvedValueOnce(MOCK_VARS)
      .mockResolvedValueOnce(MOCK_DATA);

    renderChart();
    await waitFor(() => {
      const btn = screen.getByText('24h');
      expect(btn.className).toContain('active');
    });
  });

  it('plots battery.runtime in minutes with a minutes axis title', async () => {
    mockApi
      .mockResolvedValueOnce({ variables: ['battery.runtime'] })
      .mockResolvedValueOnce({
        variables: { 'battery.runtime': [[1000000, 4968], [1000060, 4800]] },
      });

    renderChart();
    // 4968 s / 60 = 82.8 min and 4800 s / 60 = 80.0 min are the y-axis extremes.
    await waitFor(() => {
      const labels = Array.from(document.querySelectorAll('.chart-svg text')).map(t => t.textContent);
      expect(labels).toContain('82.8');
      expect(labels).toContain('80.0');
    });
    const labels = Array.from(document.querySelectorAll('.chart-svg text')).map(t => t.textContent);
    expect(labels).not.toContain('4968.0');
    expect(document.querySelector('.chart-axis-title')?.textContent).toBe('minutes');
  });

  it('labels runtime variables with their display unit', async () => {
    mockApi
      .mockResolvedValueOnce({ variables: ['battery.charge', 'battery.runtime'] })
      .mockResolvedValueOnce(MOCK_DATA);

    renderChart();
    await waitFor(() => {
      expect(screen.getByText('battery.runtime')).toBeInTheDocument();
    });
    expect(screen.getByText('(min)')).toBeInTheDocument();
    expect(screen.getAllByText(/^\(.*\)$/)).toHaveLength(1);
  });

  it('omits the axis title when runtime shares the chart with other series', async () => {
    mockApi
      .mockResolvedValueOnce({ variables: ['battery.charge', 'battery.runtime'] })
      .mockResolvedValueOnce({
        variables: {
          'battery.charge': [[1000000, 100], [1000060, 99]],
          'battery.runtime': [[1000000, 4968], [1000060, 4800]],
        },
      });

    const user = userEvent.setup();
    renderChart();
    await waitFor(() => {
      expect(document.querySelectorAll('.chart-svg path').length).toBe(1);
    });
    await user.click(screen.getByLabelText(/battery\.runtime/));
    await waitFor(() => {
      expect(document.querySelectorAll('.chart-svg path').length).toBe(2);
    });
    expect(document.querySelector('.chart-axis-title')).toBeNull();
  });

  it('defaults to battery.charge and ups.load checked', async () => {
    mockApi
      .mockResolvedValueOnce(MOCK_VARS)
      .mockResolvedValueOnce(MOCK_DATA);

    renderChart();
    await waitFor(() => {
      const chargeCheckbox = screen.getByLabelText('battery.charge') as HTMLInputElement;
      expect(chargeCheckbox.checked).toBe(true);
    });
    const loadCheckbox = screen.getByLabelText('ups.load') as HTMLInputElement;
    expect(loadCheckbox.checked).toBe(true);
  });
});
