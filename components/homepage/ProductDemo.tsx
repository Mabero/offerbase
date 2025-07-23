'use client';

import { motion } from 'framer-motion';
import { useInView } from 'react-intersection-observer';
import { 
  Play, 
  MessageSquare, 
  BarChart3, 
  TrendingUp,
  Star,
  ArrowRight
} from 'lucide-react';
import { useState } from 'react';

const ProductDemo = () => {
  const [ref, inView] = useInView({
    triggerOnce: true,
    threshold: 0.1
  });

  const [activeTab, setActiveTab] = useState('dashboard');

  const tabs = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: BarChart3
    },
    {
      id: 'chat',
      label: 'Chat Widget',
      icon: MessageSquare
    },
    {
      id: 'analytics',
      label: 'Analytics',
      icon: TrendingUp
    }
  ];

  return (
    <section className="py-32 bg-gradient-to-b from-gray-50 to-white" ref={ref}>
      <div className="max-w-7xl mx-auto px-8">
        {/* Section Header */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8 }}
          className="text-center mb-20"
        >
          <h2 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
            See Offerbase in
            <span className="block bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              action
            </span>
          </h2>
          
          <p className="text-xl text-gray-600 max-w-3xl mx-auto mb-12">
            Experience the power of our platform with interactive demos showcasing 
            real-world scenarios and actual results from our customers.
          </p>

          {/* Video Preview Button */}
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={inView ? { opacity: 1, scale: 1 } : {}}
            transition={{ delay: 0.3, duration: 0.8 }}
            whileHover={{ scale: 1.05 }}
            className="inline-flex items-center space-x-4 bg-white/80 backdrop-blur-md rounded-2xl p-6 cursor-pointer group shadow-lg border border-gray-200"
          >
            <div className="bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full p-4">
              <Play className="h-8 w-8 text-white" />
            </div>
            <div className="text-left">
              <div className="text-gray-900 font-semibold text-lg">Watch 2-minute demo</div>
              <div className="text-gray-600">See how it works</div>
            </div>
            <ArrowRight className="h-6 w-6 text-gray-500 group-hover:text-gray-700 transition-colors" />
          </motion.div>
        </motion.div>

        {/* Interactive Demo Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.5, duration: 0.8 }}
          className="mb-12"
        >
          <div className="flex justify-center space-x-1 bg-gray-100 rounded-2xl p-2">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center space-x-2 px-6 py-3 rounded-xl transition-all ${
                    activeTab === tab.id
                      ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-200'
                  }`}
                >
                  <Icon className="h-5 w-5" />
                  <span className="font-medium">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </motion.div>

        {/* Demo Content */}
        <motion.div
          initial={{ opacity: 0, y: 50 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ delay: 0.7, duration: 0.8 }}
          className="relative"
        >
          {/* Dashboard Demo */}
          {activeTab === 'dashboard' && (
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
              className="bg-white rounded-3xl border border-gray-200 overflow-hidden shadow-lg"
            >
              {/* Mock Browser Bar */}
              <div className="bg-gray-100 px-6 py-4 flex items-center space-x-2">
                <div className="flex space-x-2">
                  <div className="w-3 h-3 bg-red-500 rounded-full"></div>
                  <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
                  <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                </div>
                <div className="flex-1 bg-gray-200 rounded-lg px-4 py-1 mx-4">
                  <span className="text-gray-600 text-sm">offerbase.com/dashboard</span>
                </div>
              </div>

              {/* Mock Dashboard Content */}
              <div className="p-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                  {[
                    { label: 'Total Revenue', value: '$24,850', change: '+12.3%', color: 'text-green-400' },
                    { label: 'Conversions', value: '1,247', change: '+8.7%', color: 'text-blue-400' },
                    { label: 'Active Widgets', value: '156', change: '+3.2%', color: 'text-purple-400' }
                  ].map((stat, index) => (
                    <motion.div
                      key={stat.label}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1, duration: 0.5 }}
                      className="bg-gray-50 rounded-2xl p-6 border border-gray-200"
                    >
                      <div className="text-gray-500 text-sm mb-2">{stat.label}</div>
                      <div className="text-2xl font-bold text-gray-900 mb-1">{stat.value}</div>
                      <div className={`text-sm ${stat.color}`}>{stat.change}</div>
                    </motion.div>
                  ))}
                </div>

                {/* Mock Chart */}
                <div className="bg-gray-50 rounded-2xl p-6 border border-gray-200">
                  <div className="text-gray-900 font-semibold mb-4">Revenue Overview</div>
                  <div className="h-40 bg-gradient-to-r from-blue-100 to-indigo-100 rounded-xl"></div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Chat Widget Demo */}
          {activeTab === 'chat' && (
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
              className="flex justify-center"
            >
              <div className="bg-white rounded-3xl shadow-2xl overflow-hidden max-w-md w-full">
                {/* Chat Header */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-4 text-white">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                      <MessageSquare className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="font-semibold">Affi Assistant</div>
                      <div className="text-sm text-purple-100">Online</div>
                    </div>
                  </div>
                </div>

                {/* Chat Messages */}
                <div className="p-4 space-y-4 h-80 overflow-y-auto">
                  <div className="flex">
                    <div className="bg-gray-100 rounded-2xl p-3 max-w-xs">
                      <p className="text-gray-800">Hi! I&apos;m looking for the best wireless headphones under $200.</p>
                    </div>
                  </div>
                  
                  <div className="flex justify-end">
                    <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-2xl p-3 max-w-xs">
                      <p>I&apos;d recommend the Sony WH-CH720N! They offer excellent sound quality and noise cancellation in your price range.</p>
                    </div>
                  </div>

                  {/* Product Card */}
                  <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200">
                    <div className="flex items-center space-x-3">
                      <div className="w-16 h-16 bg-gradient-to-br from-gray-300 to-gray-400 rounded-xl"></div>
                      <div className="flex-1">
                        <div className="font-semibold text-gray-900">Sony WH-CH720N</div>
                        <div className="text-green-600 font-bold">$149.99</div>
                        <div className="flex items-center space-x-1 text-sm text-gray-600">
                          <Star className="h-4 w-4 text-yellow-500 fill-current" />
                          <span>4.5 (2,847 reviews)</span>
                        </div>
                      </div>
                    </div>
                    <button className="w-full mt-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-2 rounded-xl font-medium">
                      View Product
                    </button>
                  </div>
                </div>

                {/* Chat Input */}
                <div className="p-4 border-t border-gray-200">
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      placeholder="Type your message..."
                      className="flex-1 border border-gray-300 rounded-xl px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-2 rounded-xl">
                      <ArrowRight className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Analytics Demo */}
          {activeTab === 'analytics' && (
            <motion.div
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5 }}
              className="bg-white rounded-3xl border border-gray-200 overflow-hidden shadow-lg p-8"
            >
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Performance Metrics */}
                <div className="space-y-6">
                  <h3 className="text-2xl font-bold text-gray-900">Performance Metrics</h3>
                  
                  {[
                    { label: 'Click-through Rate', value: '4.2%', trend: '+0.8%' },
                    { label: 'Conversion Rate', value: '2.1%', trend: '+0.3%' },
                    { label: 'Average Order Value', value: '$127', trend: '+$12' }
                  ].map((metric, index) => (
                    <motion.div
                      key={metric.label}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.1, duration: 0.5 }}
                      className="flex items-center justify-between bg-gray-50 rounded-xl p-4 border border-gray-200"
                    >
                      <div>
                        <div className="text-gray-600 text-sm">{metric.label}</div>
                        <div className="text-gray-900 font-bold text-lg">{metric.value}</div>
                      </div>
                      <div className="text-green-400 text-sm font-medium">{metric.trend}</div>
                    </motion.div>
                  ))}
                </div>

                {/* Revenue Chart */}
                <div className="bg-gray-50 rounded-xl p-6 border border-gray-200">
                  <h4 className="text-gray-900 font-semibold mb-4">Revenue Trend</h4>
                  <div className="h-48 bg-gradient-to-t from-blue-100 to-indigo-200 rounded-lg"></div>
                </div>
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>
    </section>
  );
};

export default ProductDemo;