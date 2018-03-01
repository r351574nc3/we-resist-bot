'use strict';
module.exports = {
  up: (queryInterface, Sequelize) => {
    return queryInterface.createTable('Preferences', {
      id: {
        allowNull: false,
        autoIncrement: true,
        primaryKey: true,
        type: Sequelize.INTEGER
      },
      username: {
        type: Sequelize.STRING
      },
      upvoteWeight: {
        type: Sequelize.DECIMAL(5,2)
      },
      downvoteWeight: {
        type: Sequelize.DECIMAL(5,2)
      },
      threshold: {
        type: Sequelize.DECIMAL(5,2)
      },
      wif: {
        type: Sequelize.STRING
      },
      createdAt: {
        allowNull: false,
        type: Sequelize.DATE
      },
      updatedAt: {
        allowNull: false,
        type: Sequelize.DATE
      }
    })
  },
  down: (queryInterface, Sequelize) => {
    return queryInterface.dropTable('Preferences');
  }
};