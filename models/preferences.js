'use strict';
module.exports = (sequelize, DataTypes) => {
  var Preferences = sequelize.define('Preferences', {
    id: {
      allowNull: false,
      autoIncrement: true,
      primaryKey: true,
      type: DataTypes.INTEGER
    },
    username: { type: DataTypes.STRING, unique: true },
    upvoteWeight: DataTypes.DECIMAL,
    downvoteWeight: DataTypes.DECIMAL,
    threshold: DataTypes.DECIMAL,
    wif: DataTypes.STRING
  }, {
    classMethods: {
      associate: function(models) {
        // associations can be defined here
      }
    }
  });
  return Preferences;
};